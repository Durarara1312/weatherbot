// Объект для хранения состояний пользователей
const userStates = {};

module.exports = {
    /**
     * Установить состояние пользователя
     * @param {number} chatId - ID чата пользователя
     * @param {string} state - Новое состояние
     */
    setState(chatId, state) {
        userStates[chatId] = state;
    },

    /**
     * Получить состояние пользователя
     * @param {number} chatId - ID чата пользователя
     * @returns {string|null} Текущее состояние пользователя
     */
    getState(chatId) {
        return userStates[chatId] || null;
    },

    /**
     * Очистить состояние пользователя
     * @param {number} chatId - ID чата пользователя
     */
    clearState(chatId) {
        delete userStates[chatId];
    }
};