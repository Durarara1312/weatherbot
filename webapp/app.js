const tg = window.Telegram.WebApp;

document.getElementById('sendCity').addEventListener('click', () => {
    tg.sendData('city=Moscow'); // Отправляем данные о городе
});

document.getElementById('sendLanguage').addEventListener('click', () => {
    tg.sendData('language=en'); // Отправляем данные о языке
});