/**
 * Account emails for Case CompendiumX — onboarding + verification.
 *
 * Two transactional templates (exact HTML the product team signed off on),
 * plus the shared Gmail-API sender used by the auth trigger and the callables
 * in index.ts. Sending goes through a Google Workspace service account
 * (GMAIL_SA_KEY) impersonating contact@casecompendiumx.in.
 */
import { google } from 'googleapis'
import { randomUUID } from 'node:crypto'

/** Minimal HTML escape for interpolated user text (names). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** First token of a display name, falling back to a friendly default. */
export function firstNameFrom(name: string | null | undefined, fallback = 'there'): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return fallback
  return trimmed.split(/\s+/)[0]
}

/* -------------------------------------------------------------------------- */
/* Onboarding email — sent to Google users on signup, and to email/password   */
/* users after they verify. Subject: "Your first case starts here"            */
/* -------------------------------------------------------------------------- */
export function buildOnboardingEmailHtml(firstName: string): string {
  const name = escapeHtml(firstName)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Your first case starts here</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
        .masthead-title { font-size: 31px !important; line-height: 35px !important; }
        .hero-title { font-size: 37px !important; line-height: 40px !important; }
        .step-number { width: 44px !important; font-size: 28px !important; }
        .mode-row,
        .mode-cell,
        .mode-gap { display: block !important; width: 100% !important; }
        .mode-cell { box-sizing: border-box !important; }
        .mode-gap { height: 10px !important; font-size: 0 !important; line-height: 0 !important; }
        .cta-link { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f4ede3;color:#3b2f2f;">
    <!-- Subject: Your first case starts here -->
    <!-- Preview: 88 cases. Two practice modes. A clear path to sharper interviews. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      88 cases. Two practice modes. A clear path to sharper interviews.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f4ede3;">
      <tr>
        <td align="center" style="padding:38px 14px 48px;">
          <table role="presentation" class="email-shell" width="620" cellspacing="0" cellpadding="0" border="0" style="width:620px;max-width:620px;background-color:#fff8f0;border:1px solid #ded1c3;">
            <tr>
              <td style="height:6px;background-color:#3d5a35;font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:28px 48px 22px;border-bottom:1px solid #e4d9ce;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#3d5a35;">
                      Welcome Note
                    </td>
                    <td align="right" style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#78695e;">
                      The casebook that thinks
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" align="center" style="padding:44px 48px 42px;border-bottom:1px solid #e4d9ce;">
                <p class="masthead-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:39px;line-height:43px;font-weight:normal;letter-spacing:-1.1px;color:#2c2218;">
                  Case Compendium<span style="color:#3d5a35;">X</span>
                </p>
                <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:22px;font-style:italic;color:#b08b48;">
                  Third Edition
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:40px 48px 26px;">
                <p style="margin:0 0 13px;font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#3d5a35;">
                  Your Day 1 playbook
                </p>
                <h1 class="hero-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:47px;font-weight:normal;letter-spacing:-1.2px;color:#2c2218;">
                  Your first case<br>starts here.
                </h1>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:0 48px 35px;">
                <p style="margin:0 0 17px;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#3b2f2f;">
                  Hey <strong style="color:#2c2218;">${name}</strong>,
                </p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;line-height:27px;color:#51443c;">
                  Glad to have you here at Case CompendiumX, where we&rsquo;ve brought together 88 cases of the Case Compendium ready to practice live on the platform.
                </p>
                <p style="margin:17px 0 0;padding:16px 18px;border-left:3px solid #b08b48;background-color:#f4ede3;font-family:Arial,sans-serif;font-size:14px;line-height:23px;color:#65564c;">
                  You&rsquo;re joining the <strong style="color:#3b2f2f;">Third Edition</strong>, where the casebook moves beyond reading into live practice, replay, and measurable improvement.
                </p>
                <p style="margin:20px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:28px;color:#2c2218;">
                  Here&rsquo;s the fastest way to get value on Day 1:
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:0 48px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td class="step-number" width="58" valign="top" style="width:58px;padding:24px 0;border-top:1px solid #d9cbbd;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;color:#3d5a35;">
                      01
                    </td>
                    <td valign="top" style="padding:24px 0;border-top:1px solid #d9cbbd;">
                      <p style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:26px;color:#2c2218;">
                        Pick a case &rsaquo; Do a Case
                      </p>
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#65564c;">
                        Choose from <strong style="color:#3b2f2f;">88 cases</strong> across Profitability, Market Entry, Growth, and more. Hit &ldquo;Do a Case&rdquo; and go.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td class="step-number" width="58" valign="top" style="width:58px;padding:24px 0;border-top:1px solid #d9cbbd;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;color:#3d5a35;">
                      02
                    </td>
                    <td valign="top" style="padding:24px 0;border-top:1px solid #d9cbbd;">
                      <p style="margin:0 0 13px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:26px;color:#2c2218;">
                        Pick your mode
                      </p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr class="mode-row">
                          <td class="mode-cell" width="48%" valign="top" style="width:48%;background-color:#f4ede3;padding:14px 15px;border-left:3px solid #3d5a35;">
                            <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;line-height:15px;font-weight:bold;letter-spacing:.9px;text-transform:uppercase;color:#3d5a35;">Same Device</p>
                            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#65564c;">You and your interviewer on one laptop.</p>
                          </td>
                          <td class="mode-gap" width="4%" style="width:4%;font-size:0;line-height:0;">&nbsp;</td>
                          <td class="mode-cell" width="48%" valign="top" style="width:48%;background-color:#f4ede3;padding:14px 15px;border-left:3px solid #3d5a35;">
                            <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;line-height:15px;font-weight:bold;letter-spacing:.9px;text-transform:uppercase;color:#3d5a35;">Remote Mode</p>
                            <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:21px;color:#65564c;">Practice with a partner across two devices over a meet.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td class="step-number" width="58" valign="top" style="width:58px;padding:24px 0;border-top:1px solid #d9cbbd;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;color:#3d5a35;">
                      03
                    </td>
                    <td valign="top" style="padding:24px 0;border-top:1px solid #d9cbbd;">
                      <p style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:26px;color:#2c2218;">
                        Get your feedback
                      </p>
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#65564c;">
                        Every attempt gives you a full transcript, structured ratings, and specific pointers on structure, hypothesis, and communication, powered by our transcription.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td class="step-number" width="58" valign="top" style="width:58px;padding:24px 0;border-top:1px solid #d9cbbd;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;color:#3d5a35;">
                      04
                    </td>
                    <td valign="top" style="padding:24px 0;border-top:1px solid #d9cbbd;">
                      <p style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:26px;color:#2c2218;">
                        Track. Improve. Repeat.
                      </p>
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#65564c;">
                        Your Feedback Data builds up over time so you can see exactly where you&rsquo;re getting sharper and where to double down.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:12px 48px 44px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background-color:#3d5a35;">
                      <a class="cta-link" href="https://www.casecompendiumx.in/repository" style="display:inline-block;padding:15px 25px;font-family:Arial,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:.2px;color:#fff8f0;text-decoration:none;">
                        Do your first case <span style="font-size:18px;line-height:14px;vertical-align:-1px;">&nbsp;&rsaquo;</span>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:30px 48px 34px;background-color:#2c2218;">
                <p style="margin:0 0 19px;font-family:Arial,sans-serif;font-size:14px;line-height:23px;color:#d9cbbd;">
                  We&rsquo;re building this in the open. Reply anytime with feedback, feature requests, or just to say hi.
                </p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:25px;color:#fff8f0;">
                  Crack it,<br>
                  <strong>The Case CompendiumX Team</strong>
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:20px 48px;background-color:#f4ede3;border-top:1px solid #ded1c3;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:18px;color:#89786c;">
                  You&rsquo;re receiving this because you signed up at
                  <a href="https://www.casecompendiumx.in" style="color:#3d5a35;text-decoration:none;">casecompendiumx.in</a>.
                  &nbsp;&copy; 2026 Case CompendiumX.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/* -------------------------------------------------------------------------- */
/* Verification email — sent to email/password users on signup / resend.      */
/* Subject: "Verify your email for Case CompendiumX"                          */
/* -------------------------------------------------------------------------- */
export function buildVerificationEmailHtml(firstName: string, verificationLink: string): string {
  const name = escapeHtml(firstName)
  const link = verificationLink
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Verify your email for Case CompendiumX</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
        .masthead-title { font-size: 31px !important; line-height: 35px !important; }
        .hero-title { font-size: 37px !important; line-height: 40px !important; }
        .cta-link { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f4ede3;color:#3b2f2f;">
    <!-- Subject: Verify your email for Case CompendiumX -->
    <!-- Preview: One quick step before your first case. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      One quick step before your first case.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f4ede3;">
      <tr>
        <td align="center" style="padding:38px 14px 48px;">
          <table role="presentation" class="email-shell" width="620" cellspacing="0" cellpadding="0" border="0" style="width:620px;max-width:620px;background-color:#fff8f0;border:1px solid #ded1c3;">
            <tr>
              <td style="height:6px;background-color:#3d5a35;font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:28px 48px 22px;border-bottom:1px solid #e4d9ce;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#3d5a35;">
                      Account Verification
                    </td>
                    <td align="right" style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:#78695e;">
                      The casebook that thinks
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" align="center" style="padding:44px 48px 42px;border-bottom:1px solid #e4d9ce;">
                <p class="masthead-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:39px;line-height:43px;font-weight:normal;letter-spacing:-1.1px;color:#2c2218;">
                  Case Compendium<span style="color:#3d5a35;">X</span>
                </p>
                <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:22px;font-style:italic;color:#b08b48;">
                  Third Edition
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:42px 48px 20px;">
                <p style="margin:0 0 13px;font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#3d5a35;">
                  One quick step
                </p>
                <h1 class="hero-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:47px;font-weight:normal;letter-spacing:-1.2px;color:#2c2218;">
                  Verify your email.
                </h1>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:0 48px 28px;">
                <p style="margin:0 0 17px;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#3b2f2f;">
                  Hey <strong style="color:#2c2218;">${name}</strong>,
                </p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;line-height:27px;color:#51443c;">
                  Please confirm that this email belongs to you to finish setting up your Case CompendiumX account. Once verified, you can start practising cases and building your feedback history.
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:0 48px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background-color:#3d5a35;">
                      <a class="cta-link" href="${link}" style="display:inline-block;padding:15px 25px;font-family:Arial,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:.2px;color:#fff8f0;text-decoration:none;">
                        Verify my email <span style="font-size:18px;line-height:14px;vertical-align:-1px;">&nbsp;&rsaquo;</span>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:0 48px 40px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4ede3;border-left:3px solid #b08b48;">
                  <tr>
                    <td style="padding:17px 18px;">
                      <p style="margin:0 0 5px;font-family:Arial,sans-serif;font-size:12px;line-height:17px;font-weight:bold;letter-spacing:.7px;text-transform:uppercase;color:#3b2f2f;">
                        This link expires in 24 hours
                      </p>
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:21px;color:#65564c;">
                        If you did not create a Case CompendiumX account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:25px 48px 28px;border-top:1px solid #e4d9ce;">
                <p style="margin:0 0 7px;font-family:Arial,sans-serif;font-size:12px;line-height:19px;color:#78695e;">
                  Button not working? Copy and paste this link into your browser:
                </p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:18px;word-break:break-all;color:#3d5a35;">
                  ${link}
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:30px 48px 34px;background-color:#2c2218;">
                <p style="margin:0 0 19px;font-family:Arial,sans-serif;font-size:14px;line-height:23px;color:#d9cbbd;">
                  After verification, your case repository, practice modes, and feedback dashboard will be ready for you.
                </p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:25px;color:#fff8f0;">
                  Crack it,<br>
                  <strong>The Case CompendiumX Team</strong>
                </p>
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:20px 48px;background-color:#f4ede3;border-top:1px solid #ded1c3;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:18px;color:#89786c;">
                  You&rsquo;re receiving this because an account was created at
                  <a href="https://www.casecompendiumx.in" style="color:#3d5a35;text-decoration:none;">casecompendiumx.in</a>.
                  &nbsp;&copy; 2026 Case CompendiumX.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/* -------------------------------------------------------------------------- */
/* Raw MIME + Gmail send (service-account, contact@casecompendiumx.in)        */
/* -------------------------------------------------------------------------- */

// RFC 2047 encoded-word for a header value containing non-ASCII characters
// (e.g. an emoji in the subject). Pure-ASCII values pass through unchanged so
// ordinary subjects stay human-readable in the raw message.
function encodeHeaderValue(value: string): string {
  // Non-ASCII if any code unit is above 0x7F -> RFC 2047 encoded-word.
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0x7f) {
      return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
    }
  }
  return value
}

function buildRawEmail(opts: { from: string; to: string; subject: string; html: string }): string {
  const boundary = `boundary_${randomUUID().replace(/-/g, '')}`
  const message = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  return Buffer.from(message).toString('base64url')
}

/**
 * Sends an HTML email via the Gmail API using the GMAIL_SA_KEY service account
 * (domain-wide delegated, impersonating contact@casecompendiumx.in). Throws on
 * misconfiguration or send failure so callers can decide how to react.
 */
export async function sendGmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const saKeyJson = process.env.GMAIL_SA_KEY
  if (!saKeyJson) {
    throw new Error('GMAIL_SA_KEY secret missing')
  }

  const saKey = JSON.parse(saKeyJson) as { client_email: string; private_key: string }

  const jwtClient = new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: 'contact@casecompendiumx.in',
  })
  await jwtClient.authorize()

  const gmail = google.gmail({ version: 'v1', auth: jwtClient })
  const raw = buildRawEmail({
    from: 'Case CompendiumX <contact@casecompendiumx.in>',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  })

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
