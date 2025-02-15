const express = require("express");
// const { Connection } = require('./mongoUtil.js');
const app = express();
const config = require("config");
const cors = require("cors");
const axios = require("axios");
const { Client, GatewayIntentBits } = require("discord.js");
const { OpenAI } = require("openai");

const PORT = 8000;

app.use(express.json({ limit: "500mb" }));
app.use(cors());
app.use(express.urlencoded({ limit: "500mb", extended: true }));


const openAIApiKey = config.get("openAIApiKey");

const openai = new OpenAI({ apiKey: openAIApiKey });

openai.api_base = 'http://127.0.0.1:1234';
openai.api_key = 'not needed'

app.get("/", (req, res) => {
  res.send(
    `<a  href="https:discord.com/oauth2/authorize?client_id=${config.get(
      "discordClientID"
    )}&redirect_uri=${encodeURIComponent(
      config.get("redirectURI")
    )}&response_type=code&scope=identify%20guilds.join">Join Discord Server</a>`
  );
});

app.get("/auth/discord", async (req, res) => {
  console.log("req.body", req.query);

  const { code } = req.query;

  if (!code) {
    return res.send("No code provided");
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: config.get("discordClientID"),
        client_secret: config.get("discordClientSecret"),
        grant_type: "authorization_code",
        code: code,
        redirect_uri: config.get("redirectURI"),
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Fetch user info
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userId = userResponse.data.id;

    // Add user to Discord Server
    await axios.put(
      `https://discord.com/api/guilds/${config.get(
        "discordGuildID"
      )}/members/${userId}`,
      { access_token: accessToken },
      {
        headers: {
          Authorization: `Bot ${config.get("discordBotToken")}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.send("You have joined the server!");
  } catch (error) {
    console.error(
      "OAuth2 Error:",
      error.response ? error.response.data : error.message
    );
    res.send("Error during authentication. Check the console.");
  }
});

const openAISearch = async (query) => {
  const response = await openai.chat.completions.create({
    model: "deepseek-r1-distill-qwen-7b",
    messages: [
      { role: "system", content: "You are a helpful AI assistant" },
      { role: "user", content: query },
    ],
    max_tokens: 100,
  });
  console.log("response data", response);
  return response.choices[0].message.content;
};

const googleSearch = async (searchQueryTerm) => {
  const apiKey = config.get("serpaKey");
  const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(
    searchQueryTerm
  )}&api_key=${apiKey}`;

  const response = await axios.get(searchUrl);
  const results = response.data.organic_results;

  console.log("results", results);

  if (!results || results.length === 0) return "No Search Results Found";

  return `**${results[0].title}\n${results[0].link}\n${results[0].snippet}`;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.login(config.get("discordBotToken"));

client.once("ready", () => {
  console.log("The client is ready...");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!chat")) {
    console.log("do something");
    const query = message.content.replace("!chat", "").trim();

    const chatgptResponse = await openAISearch(query);

    message.reply();
  } else if (message.content.startsWith("!search")) {
    console.log("search");

    const query = message.content.replace("!search", "").trim();

    if (!query) {
      return message.reply("Please enter a search query term");
    }
    try {
      const searchResult = await googleSearch(query);

      console.log("searchResult", searchResult);

      message.reply(searchResult);
    } catch (error) {
      console.log("error", error);
    }
  }
});

app.listen(PORT, () => {
  console.log(`App is listening on port: ${PORT}`);
});
