"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const axios_1 = __importDefault(require("axios"));
const http_1 = require("http");
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.raw());
app.use(body_parser_1.default.text());
var Role;
(function (Role) {
    Role["system"] = "system";
    Role["user"] = "user";
    Role["assistant"] = "assistant";
    Role["function"] = "function";
})(Role || (Role = {}));
const openAIKey = process.env.OPENAI_API_KEY;
const uberDuckUser = process.env.UBER_DUCK_USER;
const uberDuckPassword = process.env.UBER_DUCK_PASSWORD;
const server = (0, http_1.createServer)();
const wss = new ws_1.WebSocketServer({ server });
const users = new Map();
const users_messages = new Map();
const system_message = { content: "You are a comedian. Please give your self a name and use it in the chat. Dont use the one provided.", role: Role.system };
let voicemodel_uuid = "92022a27-75fb-4e15-90ca-95095a82f5ee";
wss.on("connection", (ws) => {
    const id = (0, crypto_1.randomUUID)();
    users.set(id, ws);
    ws.on("close", () => {
        users.delete(id);
    });
    users_messages.set(id, [system_message]);
    ws.on("message", (data) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const message = data.toString();
            if (message.toLowerCase() === "reload") {
                users_messages.set(id, [system_message]);
                return;
            }
            const user_messages = users_messages.get(id) || [];
            user_messages.push({ content: message, role: Role.user });
            const response = yield axios_1.default.post("https://api.openai.com/v1/chat/completions", {
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
            });
            user_messages.push(response.data.choices[0].message);
            const resp_message = response.data.choices[0].message.content;
            ws.send(resp_message);
            const uber_resp = yield axios_1.default.post("https://api.uberduck.ai/speak", {
                speech: resp_message,
                voicemodel_uuid: voicemodel_uuid,
            }, {
                headers: {
                    "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`,
                    "Content-Type": "application/json"
                }
            });
            let file_path;
            while (true) {
                const status = yield axios_1.default.get(`https://api.uberduck.ai/speak-status?uuid=${uber_resp.data.uuid}`, {
                    headers: {
                        "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
                    }
                });
                if (status.data.finished_at) {
                    file_path = status.data.path;
                    break;
                }
                else if (status.data.failed_at) {
                    ws.send("failed");
                    return;
                }
            }
            (0, child_process_1.exec)(`curl ${file_path} | ffmpeg -i - -af "volume=3.0" -y -acodec dfpwm -ac 1 -ar 48000 -vn -fs 25000000 -f dfpwm -`, { encoding: "buffer" }, (err, stdout, stderr) => {
                if (err) {
                    console.log(err);
                    ws.send("failed");
                    return;
                }
                ws.send(stdout);
            });
        }
        catch (e) {
            console.log(e);
        }
    }));
});
app.post("/get_audio/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        if (!id) {
            throw new Error("No id provided");
        }
        let user_messages = users_messages.get(id);
        if (!user_messages) {
            users_messages.set(id, [system_message]);
            user_messages = users_messages.get(id) || [system_message];
        }
        user_messages.push({ content: req.body, role: Role.user });
        const response = yield axios_1.default.post("https://api.openai.com/v1/chat/completions", {
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
        });
        user_messages.push(response.data.choices[0].message);
        const uber_resp = yield axios_1.default.post("https://api.uberduck.ai/speak", {
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
            const status = yield axios_1.default.get(`https://api.uberduck.ai/speak-status?uuid=${uber_resp.data.uuid}`, {
                headers: {
                    "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
                }
            });
            if (status.data.finished_at) {
                file_path = status.data.path;
                break;
            }
            else if (status.data.failed_at) {
                res.sendStatus(500);
                return;
            }
        }
        (0, child_process_1.exec)(`curl ${file_path}`, { encoding: "buffer" }, (err, stdout, stderr) => {
            if (err) {
                console.log(err);
                res.sendStatus(500);
                return;
            }
            // res.send(stdout);
            res.send(stdout);
        });
    }
    catch (e) {
        console.log(e);
        res.sendStatus(500);
    }
}));
app.post("/set_voice/:id", (req, res) => {
    const id = req.params.id || "92022a27-75fb-4e15-90ca-95095a82f5ee";
    voicemodel_uuid = id;
    res.sendStatus(200);
});
app.get("/voices", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const voices = yield axios_1.default.get("https://api.uberduck.ai/voices?mode=tts-basic&language=english", {
        headers: {
            "Authorization": `Basic ${btoa(uberDuckUser + ":" + uberDuckPassword)}`
        }
    }).catch((e) => {
        console.log(e);
        return { data: [] };
    });
    // want to sort it so that all the voices that share the same image are grouped
    res.send(voices.data);
}));
app.get("/css", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "public", "index.css"));
});
app.get("/js", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "public", "index.js"));
});
app.get("*", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "public", "index.html"));
});
server.on("request", app);
server.listen(3000, () => {
    console.log("Listening on port 3000");
});
//# sourceMappingURL=index.js.map