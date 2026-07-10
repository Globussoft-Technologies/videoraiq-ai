import crypto from 'crypto'

class PasswordEncoderDecoder {

    async encryptText(text, key) {
        const IV_LENGTH = 16 // For AES, this is always 16
        let iv = crypto.randomBytes(IV_LENGTH)
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv)
        let encrypted = cipher.update(text)
        encrypted = Buffer.concat([encrypted, cipher.final()])
        let encoded = iv.toString('hex') + ':' + encrypted.toString('hex');
        return encoded;
    }

    async decryptText(text, key) {
        let textParts = text.split(':')
        let iv = Buffer.from(textParts.shift(), 'hex')
        let encryptedText = Buffer.from(textParts.join(':'), 'hex')
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv)
        let decrypted = decipher.update(encryptedText)

        decrypted = Buffer.concat([decrypted, decipher.final()])
        let final = decrypted.toString()
        return final;
    }
        // Encrypt-like function
        encryptPassword = (password, key) => {
            const combined = password + key; // append key
            return btoa(combined);           // encode in base64
        };
        
        // Decrypt-like function
        decryptPassword = (encoded, key) => {
            const decoded = atob(encoded);               // decode from base64
            return decoded.replace(key, '');             // remove the key
        };
}

export default new PasswordEncoderDecoder();