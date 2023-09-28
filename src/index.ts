import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { exec } from "child_process";


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

const openAIKey = process.env.OPENAI_API_KEY;
const uberDuckUser = process.env.UBER_DUCK_USER;
const uberDuckPassword = process.env.UBER_DUCK_PASSWORD;

const server = createServer();
const wss = new WebSocketServer({ server });
const users: Map<string, WebSocket> = new Map();
const users_messages: Map<string, Array<Message>> = new Map();

wss.on("connection", (ws: WebSocket) => {
    const id = randomUUID();
    users.set(id, ws);
    ws.on("close", () => {
        users.delete(id);
    })
    users_messages.set(id, [{ content: "You are a comedian", role: Role.system }]);
    ws.on("message", async (data) => {
        try {
            const message = data.toString();
            if (message.toLowerCase() === "reload") {
                users_messages.set(id, [{ content: "You are a comedian", role: Role.system }]);
                return
            }
            users_messages.set(id, [...(users_messages.get(id) || [{ content: "You are a comedian", role: Role.system }]), { content: message, role: Role.user }]);
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
            users_messages.set(id, [...(users_messages.get(id) || [{ content: "You are a comedian", role: Role.system }]), response.data.choices[0].message]);
            const resp_message = response.data.choices[0].message.content;
            ws.send(resp_message);
            const uber_resp = await axios.post("https://api.uberduck.ai/speak", {
                speech: resp_message,
                voicemodel_uuid: "92022a27-75fb-4e15-90ca-95095a82f5ee",
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
                    ws.send(JSON.stringify("failed"))
                    return
                }
            }
            exec(`curl ${file_path} | ffmpeg -i - -y -acodec dfpwm -ac 1 -ar 48000 -vn -fs 25000000 -f dfpwm -`, (err, stdout, stderr) => {
                if (err) {
                    console.log(err)
                    return
                }
                // if (stderr) {
                //     console.log(stderr)
                // }
                ws.send(stdout)
            })
        } catch (e) {
            console.log(e)
        }
    })
})

server.listen(3000, () => {
    console.log("Listening on port 3000");
})