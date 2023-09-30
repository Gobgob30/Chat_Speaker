const root = document.getElementById('root')
const id = self.crypto.randomUUID()
const input_button = document.getElementById('input_button')
const input = document.getElementById('input')
const audio_source = document.getElementById('audio_source')
input_button.addEventListener('click', () => {
    fetch(`http://localhost:3000/get_audio/${id}`, {
        method: 'POST',
        body: input.value
    }).then(async data => {
        const blob = await data.blob()
        audio_source.src = URL.createObjectURL(blob)
        audio_source.play()
        input.value = '';
    }).catch(err => {
        console.log(err)
    })
})
const resp = await fetch('http://localhost:3000/voices')
const voices = await resp.json()
console.log(voices)
voices.sort((a, b) => {
    return a.display_name.localeCompare(b.display_name)
})
voices.forEach(voice => {
    const div = document.createElement('div')
    const button = document.createElement('button')
    button.innerText = voice.display_name
    button.addEventListener('click', () => {
        fetch(`http://localhost:3000/set_voice/${voice.voicemodel_uuid}`, {
            method: 'POST'
        }).catch(err => {
            console.log(err)
        })
    })
    button.className = voice.gender === 'male' ? 'male_btn' : 'female_btn'
    div.appendChild(button)
    const image = document.createElement('img')
    image.src = voice.image_url
    image.alt = voice.display_name
    div.appendChild(image)
    root.appendChild(div)
})
