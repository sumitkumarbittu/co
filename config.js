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

    extractServerId: (input, datePrefix) => {
        if (!input || typeof input !== 'string' || !datePrefix) return null;

        for (const serverId of SERVERS) {
            const pattern = datePrefix + serverId;
            if (input.includes(pattern)) {
                return serverId;
            }
        }

        return null;
    }
};
