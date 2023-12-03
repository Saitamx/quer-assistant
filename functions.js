const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const createAssistant = async (axiosInstance) => {
  const assistantFilePath = path.join(__dirname, "assistant.json");

  if (fs.existsSync(assistantFilePath)) {
    const assistantData = JSON.parse(
      fs.readFileSync(assistantFilePath, "utf8")
    );
    console.log("Loaded existing assistant ID.");
    return assistantData.assistant_id;
  } else {
    const fileFormData = new FormData();
    fileFormData.append("file", fs.createReadStream("caliwea.docx"));
    fileFormData.append("purpose", "assistants");

    const fileResponse = await axiosInstance.post(
      "https://api.openai.com/v1/files",
      fileFormData,
      {
        headers: {
          ...fileFormData.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const assistantResponse = await axiosInstance.post(
      "https://api.openai.com/v1/assistants",
      {
        instructions:
          "Desarrolla un asistente de inteligencia artificial para la disciplina deportiva Caliwea, que promueva la alegría del movimiento, la diversidad de experiencias, y la construcción de una comunidad inclusiva y respetuosa. El asistente debe enfocarse en la seguridad, el bienestar integral, y ofrecer un sistema de gamificación para motivar a los usuarios. Debe integrar elementos de calistenia, escalada, yoga, y celebrar la cultura chilena, fomentando la participación activa en una comunidad vibrante y alegre. También debe promover la educación y la cultura chilena en la comunidad. El asistente debe tener una comunicación concreta, fluida y efectiva, y debe responder a las preguntas y solicitudes de manera clara y concisa. El asistente debe tener una estructura clara y eficiente para responder a las preguntas y solicitudes. Hemos proporcionado un documento que contiene informacion de caliwea, cada vez que no sepas algo respecto a tu contexto principal, recurre al documento.",
        model: "gpt-4-1106-preview",
        tools: [{ type: "retrieval" }],
        file_ids: [fileResponse.data.id],
      }
    );

    const assistantId = assistantResponse.data.id;

    fs.writeFileSync(
      assistantFilePath,
      JSON.stringify({ assistant_id: assistantId }, null, 2)
    );
    console.log("Created a new assistant and saved the ID.");
    return assistantId;
  }
};

module.exports = { createAssistant };
