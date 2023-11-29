const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const functions = require("./functions");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v1",
  },
  maxBodyLength: Infinity,
});

let assistantId;
functions.createAssistant(axiosInstance).then((assistantIdReturned) => {
  assistantId = assistantIdReturned;
});

app.get("/start", async (req, res) => {
  try {
    const response = await axiosInstance.post(
      "https://api.openai.com/v1/threads",
      { messages: [] }
    );
    console.log(`New thread created with ID: ${response.data.id}`);
    res.json({ thread_id: response.data.id });
  } catch (error) {
    console.error("Error starting a new conversation:", error);
    res.status(500).send("Error starting a new conversation");
  }
});

app.post("/chat", async (req, res) => {
  const { thread_id, message } = req.body;
  console.log("req.body", req.body);
  if (!thread_id) {
    console.log("Error: Missing thread_id");
    return res.status(400).json({ error: "Missing thread_id" });
  }

  try {
    await axiosInstance.post(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      { role: "user", content: message }
    );
    const response = await axiosInstance.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      { assistant_id: assistantId }
    );
    console.log(`Run initiated with ID: ${response.data.id}`);
    res.json({ run_id: response.data.id, status: "in_progress" });
  } catch (error) {
    console.error("Error in chat:", error.response || error);
    res.status(500).send("Error in chat");
  }
});

app.get("/chat/status/:run_id/:thread_id", async (req, res) => {
  const { run_id, thread_id } = req.params;
  try {
    const runStatusResponse = await axiosInstance.get(
      `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`
    );
    const runStatus = runStatusResponse.data.status;

    if (runStatus === "completed") {
      const messagesResponse = await axiosInstance.get(
        `https://api.openai.com/v1/threads/${thread_id}/messages`
      );
      const assistantResponses = messagesResponse.data.data
        .filter((message) => message.role === "assistant")
        .map((msg) =>
          msg.content && msg.content.length > 0
            ? msg.content[0].text
            : "No text content"
        );

      res.json({ status: runStatus, response: assistantResponses });
    } else {
      res.json({ status: runStatus });
    }
  } catch (error) {
    console.error("Error checking chat status:", error.response || error);
    res.status(500).send("Error checking chat status");
  }
});

app.get("/models", async (req, res) => {
  try {
    const response = await axiosInstance.get(
      "https://api.openai.com/v1/models"
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error retrieving models:", error);
    res.status(500).send("Error retrieving models");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
