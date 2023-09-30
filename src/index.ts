import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { exec, spawn } from "child_process";
import express from "express";
import bodyParser from "body-parser";

const app: express.Application = express();
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.use(bodyParser.text());

enum Role {
    ["system"] = "system",
    ["user"] = "user",
    ["assistant"] = "assistant",
    ["function"] = "function"
}

interface Message {
    content: string
    role: Role
}

interface VoiceModel {
    accent: string,
    added_at: string,
    age: string,
    architecture: string,
    category: string,
    contributors: [
        string
    ],
    controls: boolean,
    description: string,
    display_name: string,
    gender: string,
    hifi_gan_vocoder: string,
    image_url: string,
    images: [
        string
    ],
    is_active: boolean,
    is_primary: boolean,
    is_private: boolean,
    language: string,
    memberships: [
        {
            id: number,
            name: string
        }
    ],
    ml_model_id: number,
    model_id: string,
    mood: string,
    name: string,
    samples: [
        {
            transcription: string,
            url: string
        }
    ],
    speaker_id: number,
    style: string,
    symbol_set: string,
    tags: [
        string
    ],
    voice_actor: string,
    voicemodel_uuid: string
}

const openAIKey = process.env.OPENAI_API_KEY;
const uberDuckUser = process.env.UBER_DUCK_USER;
const uberDuckPassword = process.env.UBER_DUCK_PASSWORD;

const server = createServer();
const wss = new WebSocketServer({ server });
const users: Map<string, WebSocket> = new Map();
const users_messages: Map<string, Array<Message>> = new Map();
const system_message: Message = { content: "You are a comedian. Please give your self a name and use it in the chat. Dont use the one provided.", role: Role.system }
let voicemodel_uuid: string = "92022a27-75fb-4e15-90ca-95095a82f5ee";

wss.on("connection", (ws: WebSocket) => {
    const id = randomUUID();
    users.set(id, ws);
    ws.on("close", () => {
        users.delete(id);
    })
    users_messages.set(id, [system_message]);
    ws.on("message", async (data) => {
        try {
            const message = data.toString();
            if (message.toLowerCase() === "reload") {
                users_messages.set(id, [system_message]);
                return
            }
            const user_messages = users_messages.get(id) || [];
            user_messages.push({ content: message, role: Role.user });
            const response = await axios.post("https://api.openai.com/v1/chat/completions", {
                model: "gpt-3.5-turbo",
                messages: users_messages.get(id),
                max_tokens: 100,
                presence_penalty: 1.5,
                temperature: 0.9
            },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openAIKey}`
                    }
                })
            user_messages.push(response.data.choices[0].message);
            const resp_message = response.data.choices[0].message.content;
            ws.send(resp_message);
            const uber_resp = await axios.post("https://api.uberduck.ai/speak", {
                speech: resp_message,
                voicemodel_uuid: voicemodel_uuid,
            }, {
                headers: {
                    "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`,
                    "Content-Type": "application/json"
                }
            })
            let file_path;
            while (true) {
                const status = await axios.get(`https://api.uberduck.ai/speak-status?uuid=${uber_resp.data.uuid}`, {
                    headers: {
                        "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
                    }
                })
                if (status.data.finished_at) {
                    file_path = status.data.path
                    break
                } else if (status.data.failed_at) {
                    ws.send("failed")
                    return
                }
            }
            exec(`curl ${file_path} | ffmpeg -i - -af "volume=3.0" -y -acodec dfpwm -ac 1 -ar 48000 -vn -fs 25000000 -f dfpwm -`, { encoding: "buffer" }, (err, stdout: Buffer, stderr) => {
                if (err) {
                    console.log(err)
                    ws.send("failed")
                    return
                }
                ws.send(stdout);
            })
        } catch (e) {
            console.log(e)
        }
    })
})

app.post("/get_audio/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            throw new Error("No id provided")
        }
        let user_messages = users_messages.get(id)
        if (!user_messages) {
            users_messages.set(id, [system_message])
            user_messages = users_messages.get(id) || [system_message];
        }
        user_messages.push({ content: req.body, role: Role.user });
        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-3.5-turbo",
            messages: users_messages.get(id),
            max_tokens: 100,
            presence_penalty: 1.5,
            temperature: 0.9
        }, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openAIKey}`
            }
        })
        user_messages.push(response.data.choices[0].message);
        const uber_resp = await axios.post("https://api.uberduck.ai/speak", {
            speech: response.data.choices[0].message.content,
            voicemodel_uuid: voicemodel_uuid,
        }, {
            headers: {
                "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`,
                "Content-Type": "application/json"
            }
        });
        let file_path;
        while (true) {
            const status = await axios.get(`https://api.uberduck.ai/speak-status?uuid=${uber_resp.data.uuid}`, {
                headers: {
                    "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
                }
            })
            if (status.data.finished_at) {
                file_path = status.data.path
                break
            } else if (status.data.failed_at) {
                res.sendStatus(500)
                return
            }
        }
        exec(`curl ${file_path}`, { encoding: "buffer" }, (err, stdout: Buffer, stderr) => {
            if (err) {
                console.log(err)
                res.sendStatus(500)
                return
            }
            // res.send(stdout);
            res.send(stdout);
        })
    } catch (e) {
        console.log(e)
        res.sendStatus(500)
    }
})

app.post("/set_voice/:id", (req, res) => {
    const id = req.params.id || "92022a27-75fb-4e15-90ca-95095a82f5ee";
    voicemodel_uuid = id;
    res.sendStatus(200)
})

app.get("/voices", async (req, res) => {
    const voices = await axios.get("https://api.uberduck.ai/voices?mode=tts-basic&language=english", {
        headers: {
            "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
        }
    }).catch((e) => {
        console.log(e)
        return { data: [] }
    })
    // want to sort it so that all the voices that share the same image are grouped
    res.send(voices.data);
})

app.get("/css", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.css"));
})

app.get("/js", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.js"));
})

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
})

server.on("request", app)

server.listen(3000, () => {
    console.log("Listening on port 3000");
})