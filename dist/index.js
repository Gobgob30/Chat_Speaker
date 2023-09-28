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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const axios_1 = __importDefault(require("axios"));
const http_1 = require("http");
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
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
wss.on("connection", (ws) => {
    const id = (0, crypto_1.randomUUID)();
    users.set(id, ws);
    ws.on("close", () => {
        users.delete(id);
    });
    users_messages.set(id, [{ content: "You are a comedian", role: Role.system }]);
    ws.on("message", (data) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const message = data.toString();
            if (message.toLowerCase() === "reload") {
                users_messages.set(id, [{ content: "You are a comedian", role: Role.system }]);
                return;
            }
            users_messages.set(id, [...(users_messages.get(id) || [{ content: "You are a comedian", role: Role.system }]), { content: message, role: Role.user }]);
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
            users_messages.set(id, [...(users_messages.get(id) || [{ content: "You are a comedian", role: Role.system }]), response.data.choices[0].message]);
            const resp_message = response.data.choices[0].message.content;
            ws.send(resp_message);
            const uber_resp = yield axios_1.default.post("https://api.uberduck.ai/speak", {
                speech: resp_message,
                voicemodel_uuid: "92022a27-75fb-4e15-90ca-95095a82f5ee",
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
                    ws.send(JSON.stringify("failed"));
                    return;
                }
            }
            (0, child_process_1.exec)(`curl ${file_path} | ffmpeg -i - -y -acodec dfpwm -ac 1 -ar 48000 -vn -fs 25000000 -f dfpwm -`, (err, stdout, stderr) => {
                if (err) {
                    console.log(err);
                    return;
                }
                // if (stderr) {
                //     console.log(stderr)
                // }
                ws.send(stdout);
            });
        }
        catch (e) {
            console.log(e);
        }
    }));
});
server.listen(3000, () => {
    console.log("Listening on port 3000");
});
//# sourceMappingURL=index.js.map