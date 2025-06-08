const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const PhoneNumber = require('awesome-phonenumber');

const app = express();

app.get('/generate-session', async (req, res) => {
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

    const { state, saveCreds } = await useMultiFileAuthState('session'); // Use session directory
    const sock = makeWASocket({ auth: state });

    try {
        // Request pairing code (triggers immediate WhatsApp notification)
        const pairingCode = await sock.requestPairingCode(pn.getNumber('significant')); // e.g., 1234567890
        res.write(`data: ${JSON.stringify({ pairingCode, message: 'Enter this code in your WhatsApp app.' })}\n\n`);
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to generate pairing code.' })}\n\n`);
        return res.end();
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            try {
                // Get session credentials
                const sessionId = JSON.stringify(state.creds, null, 2);

                // Send session ID to user's WhatsApp DM
                const userJid = `${pn.getNumber('significant')}@s.whatsapp.net`;
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
});

module.exports = app
