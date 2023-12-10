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

let assistantId = 'asst_hqofASahTlXspPHZYriRY8PU';

app.post("/newThread", async (req, res) => {
  const { user, password } = req.body;

  if (!user || !password) {
    return res.status(400).json({ error: "Faltan campos requeridos." });
  }

  if (user !== process.env.USER || password !== process.env.PASSWORD) {
    return res.status(403).json({ error: "Autenticación fallida." });
  }

  try {
    assistantId = await functions.handleCreateAssistant(axiosInstance);
    console.log(`New assistant created with ID: ${assistantId}`);
    res.json({ assistantId });
  } catch (error) {
    console.error("Error creating assistant:", error);
    res.status(500).send("Error creating assistant");
  }
});

app.post("/newMessage", async (req, res) => {
  const { message } = req.body;

  let thread_id = 'thread_BxYTAKAE4hiU8Q5ZKy18QmuM'

  try {
    const categoryCode = await functions.handleClassifyQuestion(message);

    const response = await axiosInstance.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      { assistant_id: assistantId},
    );
    console.log(`Run initiated with ID: ${response.data.id}`);

    const messages = await functions.handleResponseInBackground(
      thread_id,
      response.data.id,
    );
    res.status(200).json({ messages, categoryCode });
  } catch (error) {
    console.error("Error in chat:", error.response.data.error);
    res.status(500).send("Error in chat");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
