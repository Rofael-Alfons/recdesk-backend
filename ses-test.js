/* eslint-disable */
// Temporary SES diagnostic / test script. Safe to delete after testing.
// Usage:
//   node ses-test.js                 -> diagnostics only (account status + identities)
//   node ses-test.js you@example.com -> also sends a test email to that address
const fs = require('fs');
const path = require('path');
const {
  SESv2Client,
  GetAccountCommand,
  ListEmailIdentitiesCommand,
  SendEmailCommand,
} = require('@aws-sdk/client-sesv2');

// Minimal .env loader (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const region = env.SES_REGION || env.AWS_REGION || 'eu-central-1';
  const fromEmail = env.SES_FROM_EMAIL || 'noreply@recdesk.io';
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  const recipient = process.argv[2];

  console.log('=== SES Test ===');
  console.log('Region:     ', region);
  console.log('From email: ', fromEmail);
  console.log('Access key: ', accessKeyId ? accessKeyId.slice(0, 6) + '...' : '(missing)');
  console.log('');

  if (!accessKeyId || !secretAccessKey) {
    console.error('Missing AWS credentials in .env');
    process.exit(1);
  }

  const client = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const account = await client.send(new GetAccountCommand({}));
    console.log('--- Account sending status ---');
    console.log('SendingEnabled:    ', account.SendingEnabled);
    console.log('ProductionAccess:  ', account.ProductionAccessEnabled, account.ProductionAccessEnabled ? '(out of sandbox)' : '(SANDBOX: can only send to verified identities)');
    if (account.SendQuota) {
      console.log('24h quota:         ', account.SendQuota.Max24HourSend);
      console.log('Sent last 24h:     ', account.SendQuota.SentLast24Hours);
    }
    console.log('');
  } catch (e) {
    console.error('GetAccount failed:', e.name, '-', e.message);
  }

  try {
    const ids = await client.send(
      new ListEmailIdentitiesCommand({ PageSize: 50 }),
    );
    console.log('--- Verified identities ---');
    if (!ids.EmailIdentities || ids.EmailIdentities.length === 0) {
      console.log('(none found in this region)');
    } else {
      for (const id of ids.EmailIdentities) {
        console.log(
          `  ${id.IdentityType}: ${id.IdentityName}  verified=${id.VerifiedForSendingStatus}`,
        );
      }
    }
    console.log('');
  } catch (e) {
    console.error('ListEmailIdentities failed:', e.name, '-', e.message);
  }

  if (recipient) {
    console.log(`--- Sending test email to ${recipient} ---`);
    try {
      const res = await client.send(
        new SendEmailCommand({
          FromEmailAddress: `RecDesk <${fromEmail}>`,
          Destination: { ToAddresses: [recipient] },
          Content: {
            Simple: {
              Subject: { Data: 'RecDesk SES test email', Charset: 'UTF-8' },
              Body: {
                Text: {
                  Data: 'This is a test email sent via AWS SES from RecDesk.',
                  Charset: 'UTF-8',
                },
                Html: {
                  Data: '<p>This is a <strong>test email</strong> sent via AWS SES from RecDesk.</p>',
                  Charset: 'UTF-8',
                },
              },
            },
          },
        }),
      );
      console.log('SUCCESS. MessageId:', res.MessageId);
    } catch (e) {
      console.error('SEND FAILED:', e.name, '-', e.message);
      process.exit(1);
    }
  } else {
    console.log('No recipient passed; skipping send. Run: node ses-test.js you@example.com');
  }
}

main();
