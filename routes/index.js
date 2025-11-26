var express = require('express');
var router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const https = require('https');

/* GET home page. */
router.get('/', function(req, res, next) {
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  res.render('index', { 
    title: '里仁高中-發卡系統',
    checkinCount: record.checkin_count
  });
});

router.get('/checkin', function(req, res, next) {

  // Load record data
  let record;
  try {
    record = require('../record');
  } catch (err) {
    // If file doesn't exist, create empty record structure
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    // Write empty record to file
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  
  // Pass record data to template
  const renderData = {
    title: '發卡中...',
    checkins: record.checkin,
    checkinCount: record.checkin_count,
    checkinRank: record.checking_rank,
    status: req.query.status
  };
  res.render('checkin', renderData);
});

router.post('/checkStatus', async function(req, res, next) {
  console.log('[/checkStatus] Received request.');
  const transactionId = req.body.transaction_id;
  console.log('[/checkStatus] transactionId:', transactionId);
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  const checkin = record.pending_checkin[transactionId];
  console.log('[/checkStatus] checkin object:', checkin);
  let status = "";
  if (checkin) {
    
    var verified = false;
    // Call verification API to check status
    const config = {
      vcSerNum: process.env.VC_SERNUM,
      vcUid: process.env.VC_UID,
      issuer_access_token: process.env.ISSUER_ACCESS_TOKEN,
      verifier_accessToken: process.env.VERIFIER_ACCESS_TOKEN
    };

    let verifierRef;
    if (checkin.subsidyType === 'sport') {
      verifierRef = process.env.VERIFIER_SPORT_REF;
    } else if (checkin.subsidyType === 'parent') {
      verifierRef = process.env.VERIFIER_PARENT_REF;
    } else if (checkin.subsidyType === 'lab') {
      verifierRef = process.env.VERIFIER_LAB_REF;
    } else if (checkin.subsidyType === 'gym') {
      verifierRef = process.env.VERIFIER_GYM_REF;
    } else {
      console.error('[/checkStatus] Invalid subsidy type in pending checkin:', checkin.subsidyType);
      throw new Error('Invalid subsidy type in pending checkin');
    }
    console.log('[/checkStatus] Using verifierRef:', verifierRef);

    const options = {
      hostname: 'verifier-sandbox.wallet.gov.tw',
      path: `/api/oidvp/result`,
      method: 'POST',
      headers: {
        'accept': '*/*',
        'access-token': config.verifier_accessToken,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Content-Type': 'application/json'
      }
    };
    console.log('[/checkStatus] Verifier API options:', options);

    let name = "";
    verified = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[/checkStatus] Verifier API request timed out.');
        apiReq.destroy();
        status = "server-timeout";
        resolve(false);
      
      }, 10000);

      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        
        apiRes.on('data', (chunk) => {
          data += chunk;
        });

        apiRes.on('end', () => {
          clearTimeout(timeout);
          console.log('[/checkStatus] Verifier API raw response data:', data);
          try {
            const result = JSON.parse(data);
            console.log('[/checkStatus] Verifier API parsed result:', result);
            if (result.code === 0 && result.verify_result === true) {
              name = result.data[0].claims.find(claim => claim.cname === 'name')?.value || '';
              resolve(true);
            } else {
              resolve(false);
            }
          } catch (err) {
            console.error('[/checkStatus] Error parsing verifier API response:', err);
            resolve(false);
          }
        });
      });

      apiReq.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[/checkStatus] Error calling verifier API:', error);
        resolve(false);
      });

      apiReq.write(JSON.stringify({ transactionId: transactionId, ref: verifierRef }));
      apiReq.end();
    });
    console.log('[/checkStatus] Verification result:', verified);
    // If verified, move checkin to main list and clean up old pending checkins
    if (verified) {
      try {
        // Move verified checkin to main checkin list
        record.checkin.push({
          ...checkin,
          name: name,
          verified: true
        });

        // Remove any existing checkins with same transaction_id
        // record.checkin = record.checkin.filter(c => c.transaction_id !== checkin.transaction_id);
        // Remove any duplicate transaction_ids from checkin list
        const seenTids = new Set();
        record.checkin = record.checkin.filter(c => {
          if (seenTids.has(c.transaction_id)) {
            return false;
          }
          seenTids.add(c.transaction_id);
          return true;
        });

        // Remove old pending checkins (over 30 mins)
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
        for (const [tid, pending] of Object.entries(record.pending_checkin)) {
          const checkinTime = new Date(pending.timestamp);
          if (checkinTime < thirtyMinsAgo) {
            delete record.pending_checkin[tid];
          }
        }

        // Recalculate total count
        record.checkin_count = record.checkin.length;

        // Recalculate rank
        const rankMap = {};
        record.checkin.forEach(c => {
          if (!rankMap[c.name]) {
            rankMap[c.name] = 0;
          }
          rankMap[c.name]++;
        });
        record.checking_rank = rankMap;
        
        // Write updated record back to file
        fs.writeFileSync('./record.js', `module.exports = ${JSON.stringify(record, null, 3)}`);
        console.log('[/checkStatus] Record updated and saved.');

        res.json({ verified: true });
      } catch (err) {
        console.error('[/checkStatus] Error updating record:', err);
        res.status(500).json({ error: 'Failed to update record' });
      }
    } else {
      console.log('[/checkStatus] Verification failed or checkin not found.');
      res.status(200).json({ error: status ?? 'Checkin not found' });
    }
  } else {
    console.log('[/checkStatus] Checkin not found for transactionId:', transactionId);
    res.status(404).json({ error: status ?? 'Checkin not found' });
  }
});

router.post('/getQRCode', function(req, res, next) {
  console.log('[/getQRCode] Received request.');
  try {
    // Generate transaction ID
    const transactionId = uuidv4();
    console.log('[/getQRCode] Generated transactionId:', transactionId);

    // Get subsidy type from request body
    const subsidyType = req.body.subsidyType;
    console.log('[/getQRCode] Received subsidyType:', subsidyType);
    let verifierRef;
    let verifierAccessToken;

    if (subsidyType === 'sport') {
      verifierRef = process.env.VERIFIER_SPORT_REF;
      verifierAccessToken = process.env.VERIFIER_ACCESS_TOKEN; // Assuming same access token for both
    } else if (subsidyType === 'parent') {
      verifierRef = process.env.VERIFIER_PARENT_REF;
      verifierAccessToken = process.env.VERIFIER_ACCESS_TOKEN; // Assuming same access token for both
    } else if (subsidyType === 'lab') {
      verifierRef = process.env.VERIFIER_LAB_REF;
      verifierAccessToken = process.env.VERIFIER_ACCESS_TOKEN; // Assuming same access token for both
    } else if (subsidyType === 'gym') {
      verifierRef = process.env.VERIFIER_GYM_REF;
      verifierAccessToken = process.env.VERIFIER_ACCESS_TOKEN; // Assuming same access token for both
    } else {
      console.error('[/getQRCode] Invalid subsidy type:', subsidyType);
      throw new Error('Invalid subsidy type');
    }
    console.log('[/getQRCode] Using verifierRef:', verifierRef);

    // Load existing record
    let record;
    try {
      record = require('../record');
    } catch (err) {
      record = {
        checkin: [],
        checkin_count: 0,
        checking_rank: {},
        pending_checkin: {}
      };
      fs.writeFileSync(
        path.join(__dirname, '../record.js'),
        'module.exports = ' + JSON.stringify(record, null, 3)
      );
    }

    // Add new checkin with timestamp and subsidyType
    const timestamp = new Date().toISOString().slice(0,19).replace('T',' ');
    record.pending_checkin = record.pending_checkin || {};
    record.pending_checkin[transactionId] = {
      name: "陳里仁", // Default name until verified
      timestamp: timestamp,
      transaction_id: transactionId,
      checkinType: subsidyType, // Store checkin type
      verified: true
    };

    // Load config
    const config = {
      vcSerNum: process.env.VC_SERNUM,
      vcUid: process.env.VC_UID,
      issuer_access_token: process.env.ISSUER_ACCESS_TOKEN,
      verifier_ref: verifierRef, // Use selected verifierRef
      verifier_accessToken: verifierAccessToken // Use selected verifierAccessToken
    };
    if (!config.verifier_ref || !config.verifier_accessToken) {
      console.error('[/getQRCode] Invalid configuration: verifier_ref or verifier_accessToken missing.');
      throw new Error('Invalid configuration');
    }

    // Call verifier API to get QR code
    const verifierApiUrl = `https://verifier-sandbox.wallet.gov.tw/api/oidvp/qr-code?ref=${config.verifier_ref}&transaction_id=${transactionId}`;
    console.log('[/getQRCode] Verifier API URL:', verifierApiUrl);

    const verifierOptions = {
      headers: {
        'accept': '*/*',
        'access-token': config.verifier_accessToken,
        'cache-control': 'no-cache'
      }
    };
    console.log('[/getQRCode] Verifier API options:', verifierOptions);

    // Make API request to get verifier QR code
    https.get(verifierApiUrl, verifierOptions, (verifierRes) => {
      let data = '';
      
      verifierRes.on('data', (chunk) => {
        data += chunk;
      });

      verifierRes.on('end', () => {
        try {
          // Parse verifier response data
          const verifierData = JSON.parse(data);
          console.log('[/getQRCode] Verifier API raw response data:', data);
          console.log('[/getQRCode] Verifier API parsed data:', verifierData);
          if (!verifierData) {
            throw new Error('Invalid response from verifier API');
          }

          // Extract required fields
          const {
            auth_uri,
            qrcode_image,
            transaction_id: verifier_transaction_id
          } = verifierData;

          if (!auth_uri || !qrcode_image) {
            console.error('[/getQRCode] Missing required fields in verifier response: auth_uri or qrcode_image.');
            throw new Error('Missing required fields in verifier response');
          }
          
          // Update checkin count
          record.checkin_count = record.checkin.length;

          try {
            // Save updated record
            fs.writeFileSync(
              path.join(__dirname, '../record.js'),
              'module.exports = ' + JSON.stringify(record, null, 3)
            );
            console.log('[/getQRCode] Record saved successfully.');
          } catch (err) {
            console.error('[/getQRCode] Failed to save record:', err);
            throw new Error('Failed to save record');
          }

          const qrcodeUrl = qrcode_image;

          res.json({
            qrcode: qrcodeUrl,
            auth_uri: auth_uri,
            transaction_id: transactionId
          });
          console.log('[/getQRCode] Successfully sent QR code data to frontend.');

        } catch (err) {
          console.error('[/getQRCode] Error processing verifier response:', err);
          res.status(500).json({
            error: 'Failed to process verifier response',
            message: err.message
          });
        }
      });

    }).on('error', (err) => {
      console.error('[/getQRCode] Error calling verifier API:', err);
      res.status(500).json({
        error: 'Failed to call verifier API',
        message: err.message
      });
    });

  } catch (err) {
    console.error('[/getQRCode] Internal server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }

  
});

router.post('/generateVC', function(req, res, next) {
  const name = req.body.name;
  const id_number = req.body.id_number;
  const roc_birthday = req.body.roc_birthday;
  const stuid = req.body.stuid;
  // Load config
  const config = {
    vcSerNum: process.env.VC_SERNUM,
    vcUid: process.env.VC_UID,
    issuer_access_token: process.env.ISSUER_ACCESS_TOKEN,
    verifier_ref: process.env.VERIFIER_REF,
    verifier_accessToken: process.env.VERIFIER_ACCESS_TOKEN
  };

  // Build VC data payload
  const payload = {
    vcId: config.vcSerNum,
    vcCid: config.vcUid,
    fields: [
      {
        type: "NORMAL",
        cname: "姓名",
        ename: "name", 
        content: name
      },
      {
        type: "NORMAL",
        cname: "身份證字號",
        ename: "id_number",
        content: id_number
      },
      {
        type: "CUSTOM",
        cname: "學號",
        ename: "stuid",
        content: stuid
      },
    ]
  };


  const options = {
    hostname: 'issuer-sandbox.wallet.gov.tw',
    path: '/api/vc-item-data', 
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Access-Token': config.issuer_access_token
    }
  };

  const req2 = https.request(options, (resp) => {
    let data = '';

    resp.on('data', (chunk) => {
      data += chunk;
    });

    resp.on('end', () => {
      let record;
      try {
        record = require('../record');
      } catch (err) {
        record = {
          checkin: [],
          checkin_count: 0,
          checking_rank: {},
          pending_checkin: {}
        };
        fs.writeFileSync(
          path.join(__dirname, '../record.js'),
          'module.exports = ' + JSON.stringify(record, null, 3)
        );
      }      
// -------------------------------------------------------------------------------------------------------

if (resp.statusCode === 201) {
  const responseJson = JSON.parse(data);
  console.log('issuer 回傳:', responseJson);

// ✅ 把回傳的 qrCode 存進變數

const qrCodeData = responseJson.qrCode || responseJson.qrCodeData || responseJson.data || null;

// -------------------------------------------------------------------------------------------------------
        res.render('qrcode', { 
          title: '學生卡申請', qrCodeData: qrCodeData, checkinCount: record.checkin_count,
          checkins: record.checkin, checkinRank: record.checking_rank,
          skip:1
        });        
      } else {
        res.render('qrcode', { title: '學生卡申請', qrCodeData: qrCodeData, checkinCount: record.checkin_count, skip:1});        
      }
    });
  });

  req2.on('error', (error) => {
  });

  req2.write(JSON.stringify(payload));
  req2.end();


});

router.get('/resta_checkin', function(req, res, next) {
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  res.render('resta_checkin', { 
    title: '餐廳',
    checkins: record.checkin,
    checkinRank: record.checking_rank,
    status: req.query.status
  });
});

router.get('/library_checkin', function(req, res, next) {
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  res.render('library_checkin', { 
    title: '圖書館',
    checkins: record.checkin,
    checkinRank: record.checking_rank,
    status: req.query.status
  });
});

router.get('/lab_checkin', function(req, res, next) {
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  res.render('lab_checkin', { 
    title: '實驗室',
    checkins: record.checkin,
    checkinRank: record.checking_rank,
    status: req.query.status
  });
});

router.get('/gym_checkin', function(req, res, next) {
  let record;
  try {
    record = require('../record');
  } catch (err) {
    record = {
      checkin: [],
      checkin_count: 0,
      checking_rank: {},
      pending_checkin: {}
    };
    fs.writeFileSync(
      path.join(__dirname, '../record.js'),
      'module.exports = ' + JSON.stringify(record, null, 3)
    );
  }
  res.render('gym_checkin', { 
    title: '體育館',
    checkins: record.checkin,
    checkinRank: record.checking_rank,
    status: req.query.status
  });
});

module.exports = router;


