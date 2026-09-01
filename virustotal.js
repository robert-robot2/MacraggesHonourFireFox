// Macragge's Honour - VirusTotal API
// virustotal.js - Handles all VirusTotal API calls

async function scanUrl(url) {
    try {
        // Don't scan blob URLs - they're local browser generated
        if (url.startsWith('blob:')) {
            return { status: 'blob', message: 'Email attachment - cannot scan' };
        }

        // Step 1 - Submit URL for analysis
        const submitResponse = await fetch('https://www.virustotal.com/api/v3/urls', {
            method: 'POST',
            headers: {
                'x-apikey': CONFIG.VIRUSTOTAL_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `url=${encodeURIComponent(url)}`
        });

        if (!submitResponse.ok) {
            return { status: 'error', message: 'VirusTotal API error' };
        }

        const submitData = await submitResponse.json();
        const analysisId = submitData.data.id;

        // Step 2 - Get analysis results
        const resultResponse = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
            method: 'GET',
            headers: {
                'x-apikey': CONFIG.VIRUSTOTAL_API_KEY
            }
        });

        if (!resultResponse.ok) {
            return { status: 'error', message: 'Could not retrieve results' };
        }

        const resultData = await resultResponse.json();
        const stats = resultData.data.attributes.stats;

        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const total = malicious + suspicious + (stats.harmless || 0) + (stats.undetected || 0);

        if (malicious > 0) {
            return { 
                status: 'threat', 
                malicious: malicious,
                total: total,
                message: `🔴 THREAT DETECTED: ${malicious}/${total} engines flagged`
            };
        } else if (suspicious > 0) {
            return {
                status: 'suspicious',
                suspicious: suspicious,
                total: total,
                message: `🟡 SUSPICIOUS: ${suspicious}/${total} engines flagged`
            };
        } else if (total > 0) {
            return {
                status: 'clean',
                total: total,
                message: `🟢 CLEAN: 0/${total} engines flagged`
            };
        } else {
            return {
                status: 'unknown',
                message: '⚪ UNKNOWN: Not in database yet'
            };
        }

    } catch (error) {
        return { status: 'error', message: 'Scan failed — network error' };
    }
}
