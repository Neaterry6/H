const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const PhoneNumber = require('awesome-phonenumber');

const app = express();

app.get('/generate-session', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const phoneNumber = req.query.phoneNumber; // e.g., +1234567890
        if (!phoneNumber) {
            res.write(`data: ${JSON.stringify({ error: 'Phone number is required.' })}\n\n`);
            return res.end();
        }

        // Validate phone number
        const pn = new PhoneNumber(phoneNumber);
        if (!pn.isValid() || !pn.isMobile()) {
            res.write(`data: ${JSON.stringify({ error: 'Invalid phone number. Use country code (e.g., +1234567890).' })}\n\n`);
            return res.end();
        }

        const { state, saveCreds } = await useMultiFileAuthState('session');
        const sock = makeWASocket({ auth: state });

        try {
            // Request pairing code
            const pairingCode = await sock.requestPairingCode(pn.getNumber('significant')); // e.g., 1234567890
            res.write(`data: ${JSON.stringify({ pairingCode, message: 'Enter this code in your WhatsApp app.' })}\n\n`);
        } catch (err) {
            console.error('Error generating pairing code:', err);
            res.write(`data: ${JSON.stringify({ error: 'Failed to generate pairing code.' })}\n\n`);
            return res.end();
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                try {
                    const sessionId = JSON.stringify(state.creds, null, 2);
                    const userJid = `${pn.getNumber('significant')}@s.whatsapp.net`;
                    await sock.sendMessage(userJid, { text: `Your Session ID:\n\`\`\`\n${sessionId}\n\`\`\`` });
                    await sock.sendMessage(userJid, { text: 'Connection successful! Your session is now active.' });
                    res.write(`data: ${JSON.stringify({ message: 'Connected! Session ID sent to your WhatsApp.' })}\n\n`);
                    res.end();
                } catch (err) {
                    console.error('Error sending session ID:', err);
                    res.write(`data: ${JSON.stringify({ error: 'Failed to send session ID.' })}\n\n`);
                    res.end();
                }
            }

            if (connection === 'close' && lastDisconnect?.error) {
                console.error('Connection closed:', lastDisconnect.error);
                res.write(`data: ${JSON.stringify({ error: 'Connection closed. Try again.' })}\n\n`);
                res.end();
            }
        });

        sock.ev.on('creds.update', saveCreds);

        req.on('close', () => {
            sock.end();
        });
    } catch (err) {
        console.error('Server error:', err);
        res.write(`data: ${JSON.stringify({ error: 'Server error.' })}\n\n`);
        res.end();
    }
});

module.exports = app
