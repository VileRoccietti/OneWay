const https = require('https');

module.exports = {
    // Extract ID from URL (e.g., https://www.roblox.com/users/12345/profile -> 12345)
    getUserIdFromLink: (url) => {
        const match = url.match(/users\/(\d+)/);
        return match ? match[1] : null;
    },

    // Get Avatar Headshot URL
    getAvatarHeadshot: (userId) => {
        return new Promise((resolve, reject) => {
            const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;

            https.get(apiUrl, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.data && json.data.length > 0) {
                            resolve(json.data[0].imageUrl);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                });
            }).on('error', (e) => {
                resolve(null);
            });
        });
    }
};
