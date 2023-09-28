local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function dec(data)
    data = string.gsub(data, '[^' .. b .. '=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r, f = '', (b:find(x) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if (#x ~= 8) then return '' end
        local c = 0
        for i = 1, 8 do c = c + (x:sub(i, i) == '1' and 2 ^ (8 - i) or 0) end
        return string.char(c)
    end))
end

-- TODO give me a base64 decode function
local chat = peripheral.find("chatBox")
if not chat then
    print("No chat box found")
    return
end
local ws, err = http.websocket("ws://127.0.0.1:3000")
if err ~= nil then
    print(err)
    return
end
local speaker = peripheral.find("speaker")
if not speaker then
    print("No speaker found")
    return
end
local dfpwm = require("cc.audio.dfpwm")

while true do
    local event, sender, message = os.pullEvent("chat")
    ws.send(string.format("%s: %s", sender, message))
    local text = ws.receive()
    chat.sendMessage(text)
    if text then
        local sound = ws.receive()
        if sound and not (sound == "failed") then
            local decoder = dfpwm.make_decoder()
            for i = 0, #sound, 16 * 1024 do
                local buffer = decoder(sound:sub(i, i + 16 * 1024 - 1))
                while not speaker.playAudio(buffer) do
                    os.pullEvent('speaker_audio_empty')
                end
            end
        end
    end
end
