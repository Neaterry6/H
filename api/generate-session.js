const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const phoneNumber = req.query.phoneNumber; // e.g., +1234567890
    if (!phoneNumber) {
        res.write(`data: ${JSON.stringify({ error: 'Phone number is required.' })}\n\n`);
        return res.end();
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state });

    try {
        // Request pairing code (triggers WhatsApp notification)
        const pairingCode = await sock.requestPairingCode(phoneNumber.replace('+', '')); // Remove + for Baileys
        res.write(`data: ${JSON.stringify({ pairingCode, message: 'Enter this code in your WhatsApp app.' })}\n\n`);
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to generate pairing code.' })}\n\n`);
        return res.end();
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            try {
                // Get session credentials (state.creds)
                const sessionId = JSON.stringify(state.creds, null, 2);

                // Send session ID to user's WhatsApp DM
                const userJid = `${phoneNumber.replace('+', '')}@s.whatsapp.net`;
                await sock.sendMessage(userJid, { text: `Your Session ID:\n\`\`\`\n${sessionId}\n\`\`\`` });

                // Send connection success message
                await sock.sendMessage(userJid, { text: 'Connection successful! Your session is now active.' });

                // Notify frontend
                res.write(`data: ${JSON.stringify({ message: 'Connected! Session ID sent to your WhatsApp.' })}\n\n`);
                res.end();
            } catch (err) {
                res.write(`data: ${JSON.stringify({ error: 'Failed to send session ID.' })}\n\n`);
                res.end();
            }
        }

        if (connection === 'close' && lastDisconnect?.error) {
            res.write(`data: ${JSON.stringify({ error: 'Connection closed. Try again.' })}\n\n`);
            res.end();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    req.on('close', () => {
        sock.end();
    });
            }
