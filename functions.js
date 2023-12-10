const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

// Configuración de Axios
const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v1",
  },
  maxBodyLength: Infinity,
});

const handleCreateAssistant = async () => {
  const assistantFilePath = path.join(__dirname, "assistant.json");

  if (fs.existsSync(assistantFilePath)) {
    const assistantData = JSON.parse(
      fs.readFileSync(assistantFilePath, "utf8"),
    );
    console.log("Loaded existing assistant ID.");
    return assistantData.assistant_id;
  } else {
    const fileFormData = new FormData();
    fileFormData.append(
      "file",
      fs.createReadStream("knowledge_restaurant.docx"),
    );
    fileFormData.append("purpose", "assistants");

    const fileResponse = await axiosInstance.post(
      "https://api.openai.com/v1/files",
      fileFormData,
      {
        headers: {
          ...fileFormData.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
    );

    const assistantResponse = await axiosInstance.post(
      "https://api.openai.com/v1/assistants",
      {
        instructions:
          "Eres un asistente digital avanzado diseñado para ayudar en restaurantes. ...",
        model: "gpt-3.5-turbo-1106",
        tools: [{ type: "retrieval" }],
        file_ids: [fileResponse.data.id],
      },
    );

    const assistantId = assistantResponse.data.id;

    fs.writeFileSync(
      assistantFilePath,
      JSON.stringify({ assistant_id: assistantId }, null, 2),
    );
    console.log("Created a new assistant and saved the ID.");
    return assistantId;
  }
};

const handleClassifyQuestion = async (question) => {
  const messages = [
    {
      role: "system",
      content:
      "Clasifica las preguntas de los clientes en una de las siguientes categorías, respondiendo con el número correspondiente: 1 para 'Menú y Opciones de Comida', 2 para 'Precios y Promociones', 3 para 'Reservas y Disponibilidad de Mesas', 4 para 'Políticas y Servicios Adicionales'. Solo debes responder con el número de la categoría correspondiente.",
    },
    {
      role: "user",
      content: question,
    },
  ];

  const response = await axiosInstance.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.0,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  const predictedCategory = response.data.choices[0].message.content.trim();
  const categoryCode = ["1", "2", "3", "4"].includes(predictedCategory)
    ? predictedCategory
    : "0";

  console.log(`Categoría detectada: ${categoryCode}`);
  return categoryCode;
};

async function handleResponseInBackground(thread_id, run_id) {
  let runStatus;
  let attempts = 0;
  const maxAttempts = 12;
  const interval = 2500;

  do {
    try {
      const [statusResponse, messagesResponse] = await Promise.all([
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
        ),
        axiosInstance.get(
          `https://api.openai.com/v1/threads/${thread_id}/messages`,
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

module.exports = {
  handleCreateAssistant,
  handleClassifyQuestion,
  handleResponseInBackground,
};
