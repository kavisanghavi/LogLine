/**
 * Diagnostic Script for Daily Check-in Bot
 * Usage: node src/utils/diagnostics.js
 */

require('dotenv').config();
const { Firestore } = require('@google-cloud/firestore');
const { encrypt, decrypt } = require('../db/encryption');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function runDiagnostics() {
    console.log('🔍 Starting Diagnostics...\n');

    // 1. Check ENCRYPTION
    console.log('🔐 Testing Encryption...');
    try {
        const testText = 'Hello World';
        const encrypted = encrypt(testText);
        const decrypted = decrypt(encrypted);
        if (decrypted === testText) {
            console.log('   ✅ Encryption/Decryption working');
        } else {
            throw new Error('Decrypted text does not match');
        }
    } catch (error) {
        console.log(`   ❌ Encryption Failed: ${error.message}`);
        console.log('      (Check if ENCRYPTION_KEY is a 64-character hex string)');
    }

    // 2. Check FIRESTORE
    console.log('\n🔥 Testing Firestore...');
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    console.log(`   Project ID: ${project}`);

    try {
        const db = new Firestore({
            projectId: project,
            databaseId: 'logline'
        });
        const testDoc = db.collection('_test_diagnostics').doc('connectivity');
        await testDoc.set({ timestamp: new Date(), message: 'Testing Firestore' });
        console.log('   ✅ Successfully wrote to Firestore');

        const doc = await testDoc.get();
        if (doc.exists) {
            console.log('   ✅ Successfully read from Firestore');
        }
        await testDoc.delete();
    } catch (error) {
        console.log(`   ❌ Firestore Failed: ${error.message}`);
        if (error.code === 5) {
            console.log('      💡 ERROR 5 NOT_FOUND: This usually means:');
            console.log('         1. The Firestore database has not been created yet.');
            console.log('         2. The database was created in "Datastore Mode" instead of "Native Mode".');
            console.log('         3. The Project ID in .env is incorrect.');
        }
    }

    // 3. Check GEMINI
    console.log('\n🧠 Testing Gemini API...');
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY missing in .env');

        console.log('   Checking key permissions via raw REST API...');
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await resp.json();
            if (data.error) {
                console.log(`   ❌ REST API Error: ${data.error.message}`);
            } else if (data.models) {
                console.log(`   ✅ REST API Success! Found ${data.models.length} models.`);
                const names = data.models.map(m => m.name.replace('models/', ''));
                console.log(`      Available Models: ${names.join(', ')}`);
            }
        } catch (e) {
            console.log(`   🔸 REST API Check failed: ${e.message}`);
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        // ... rest of previous testing ...
        const modelNames = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
        let foundWorkingModel = false;

        for (const name of modelNames) {
            try {
                const model = genAI.getGenerativeModel({ model: name });
                const result = await model.generateContent('Hi');
                if (result.response.text()) {
                    console.log(`   ✅ Gemini SDK working with model: ${name}`);
                    foundWorkingModel = true;
                    break;
                }
            } catch (e) {
                console.log(`   🔸 Model ${name} failed: ${e.message.split('\n')[0]}`);
            }
        }

        if (!foundWorkingModel) {
            throw new Error('Could not find any working Gemini model via SDK');
        }
    } catch (error) {
        console.log(`   ❌ Gemini Diagnostic Failed: ${error.message}`);
    }

    console.log('\n🏁 Diagnostics Complete.');
}

runDiagnostics();
