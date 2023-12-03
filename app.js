// Importando los módulos necesarios
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const functions = require("./functions");
require("dotenv").config();

// Creando la aplicación Express y configurando el middleware
const app = express();
app.use(bodyParser.json());

// Configurando la clave de API de OpenAI y la instancia de Axios
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v1",
  },
  maxBodyLength: Infinity,
});

// Variable para almacenar el ID del asistente
let assistantId;

// Creando un asistente de OpenAI y almacenando su ID
functions.createAssistant(axiosInstance).then((assistantIdReturned) => {
  assistantId = assistantIdReturned;
});

// Ruta para iniciar una nueva conversación
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

// Ruta para manejar el chat
app.post("/chat", async (req, res) => {
  const { thread_id, message } = req.body;

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
    console.log({ run_id: response.data.id, status: "in_progress" });

    handleResponseInBackground(thread_id, response.data.id, res);
  } catch (error) {
    console.error("Error in chat:", error.response || error);
    res.status(500).send("Error in chat");
  }
});

// Función para manejar la respuesta en segundo plano
async function handleResponseInBackground(thread_id, run_id, res) {
  let runStatus;
  do {
    try {
      // Ejecutando consultas en paralelo
      const [statusResponse, messagesResponse] = await Promise.all([
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`
        ),
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/messages`
        ),
      ]);
      runStatus = statusResponse.data.status;

      // Si la ejecución está completada, enviar la respuesta
      if (runStatus === "completed") {
        res.status(200).json({ messages: messagesResponse.data });
        return;
      }
    } catch (error) {
      console.log(error);
      res.status(500).send("Error retrieving response");
      return;
    }

    // Esperando antes de la próxima verificación
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (runStatus !== "completed");
}

// Configurando el puerto y poniendo en marcha el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
