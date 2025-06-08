const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const phoneNumber = req.query.phoneNumber; // Get phone number from query
    if (!phoneNumber) {
        res.write(`data: ${JSON.stringify({ error: 'Phone number is required.' })}\n\n`);
        return res.end();
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state });

    try {
        // Request pairing code
        const pairingCode = await sock.requestPairingCode(phoneNumber);
        res.write(`data: ${JSON.stringify({ pairingCode, message: 'Enter this code in your WhatsApp app.' })}\n\n`);
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Failed to generate pairing code.' })}\n\n`);
        return res.end();
    }

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;

        if (connection === 'open') {
            res.write(`data: ${JSON.stringify({ message: 'Connected! Session ID saved.' })}\n\n`);
            res.end();
        }

        if (connection === 'close') {
            res.write(`data: ${JSON.stringify({ error: 'Connection closed. Try again.' })}\n\n`);
            res.end();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    req.on('close', () => {
        sock.end();
    });
          
