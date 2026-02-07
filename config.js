const SERVERS = [
    '1234',
    '5678',
    '9999'
];

module.exports = {
    SERVERS,

    isValidServer: (serverId) => {
        return SERVERS.includes(serverId);
    },

    getTableNames: (serverId) => {
        return {
            messages: `messages_${serverId}`,
            media: `media_${serverId}`
        };
    },

    extractServerId: (password) => {
        if (!password || typeof password !== 'string') return null;

        if (password.length < 6) return null;

        const serverId = password.slice(-4);

        if (!/^\d{4}$/.test(serverId)) return null;

        return serverId;
    }
};
