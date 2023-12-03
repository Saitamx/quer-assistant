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
    const colorResponse = await handleClassifyQuestion(message);

    await axiosInstance.post(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      { role: "user", content: message }
    );

    const response = await axiosInstance.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      { assistant_id: assistantId }
    );
    console.log(`Run initiated with ID: ${response.data.id}`);

    const messagesResponse = await handleResponseInBackground(
      thread_id,
      response.data.id
    );
    res.status(200).json({ messages: messagesResponse, color: colorResponse });
  } catch (error) {
    console.error("Error in chat:", error.response || error);
    res.status(500).send("Error in chat");
  }
});

// Función para manejar la respuesta en segundo plano
async function handleResponseInBackground(thread_id, run_id) {
  let runStatus;
  let attempts = 0;
  const maxAttempts = 12;
  const interval = 2500;

  do {
    try {
      const [statusResponse, messagesResponse] = await Promise.all([
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`
        ),
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/messages`
        ),
      ]);
      runStatus = statusResponse.data.status;

      if (runStatus === "completed") {
        return messagesResponse.data;
      }
    } catch (error) {
      console.error("Error retrieving response:", error);
      return { error: "Error retrieving response" };
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  } while (runStatus !== "completed" && attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    return { error: "Timeout: La respuesta del asistente tardó demasiado." };
  }
}

// Clasificación de preguntas con modelo llm
const handleClassifyQuestion = async (question) => {
  const prompt = `Pregunta: "${question}"\n La pregunta anterior, ¿esta relacionada con alguno de estos 4 colores?: azul, rojo, rosado, amarillo. Responde en una sola palabra el color que creas que esta relacionado con la pregunta anterior.`;
  let response = await axios.post(
    process.env.CHAT_SERVICE,
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.0,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  response = response.data?.choices[0]?.message["content"].toLowerCase();
  return response === "azul" ||
    response === "rojo" ||
    response === "rosado" ||
    response === "amarillo"
    ? response
    : false;
};

// Configurando el puerto y poniendo en marcha el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
