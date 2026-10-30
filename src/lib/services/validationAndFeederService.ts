import dns from 'dns/promises';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator } from '@/lib/services/gmailService';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'sharklasers.com', 'trashmail.com', 'getnada.com', 'temp-mail.org'
]);

export class ValidationAndFeederService {
  /**
   * 1. VALIDAZIONE HARD EMAIL (Sintassi + Anti-Disposable + Lookup DNS MX reale)
   */
  static async verifyRealEmail(email: string): Promise<{ valid: boolean; reason?: string; isPersonal: boolean }> {
    const cleanEmail = email.trim().toLowerCase();
    const domain = cleanEmail.split('@')[1];
    if (!domain) return { valid: false, reason: 'Dominio mancante', isPersonal: false };

    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { valid: false, reason: 'Email temporanea/usa-e-getta rilevata', isPersonal: true };
    }

    const personalDomains = ['gmail.com', 'libero.it', 'hotmail.com', 'hotmail.it', 'yahoo.it', 'yahoo.com', 'icloud.com', 'alice.it', 'tiscali.it', 'virgilio.it', 'live.it', 'outlook.com', 'outlook.it'];
    const isPersonal = personalDomains.includes(domain);

    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, reason: 'Dominio privo di server di posta (MX)', isPersonal };
      }
      return { valid: true, isPersonal };
    } catch {
      return { valid: false, reason: 'Dominio email inesistente a livello DNS', isPersonal };
    }
  }

  /**
   * 2. VALIDAZIONE TELEFONO E ANTI-FAKE (Rileva sequenze finte es. 3333333333 o 123456789)
   */
  static verifyPhone(phone?: string): { valid: boolean; normalized: string } {
    if (!phone) return { valid: true, normalized: '' };
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) return { valid: false, normalized: digits };

    // Blocca numeri con 7 cifre identiche consecutive o scale finte
    if (/(\d)\1{6,}/.test(digits) || digits.includes('12345678') || digits.includes('0000000')) {
      return { valid: false, normalized: digits };
    }

    const normalized = digits.startsWith('39') ? `+${digits}` : `+39${digits}`;
    return { valid: true, normalized };
  }

  /**
   * 3. GENERAZIONE E INVIO REALE CODICE OTP A 6 CIFRE (Email + SMS Twilio opzionale)
   */
  static async generateAndSendOtp(profileId: string, email: string, phone?: string, tenantName: string = "Scintilla Hub"): Promise<string> {
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Scadenza 15 minuti

    // Rimuove eventuali vecchi token e salva il nuovo
    await prisma.otpToken.deleteMany({ where: { profileId } });
    await prisma.otpToken.create({
      data: { profileId, token, expiresAt }
    });

    const senderBrand = tenantName.includes("Scintilla") ? "Scintilla Hub" : tenantName;

    // A. Invio SMS reale via Twilio (se configurato nelle env)
    if (phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
        const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const body = new URLSearchParams({
          To: phone,
          From: process.env.TWILIO_PHONE_NUMBER,
          Body: `[${senderBrand}] Il tuo codice di verifica e': ${token}. Valido per 15 minuti.`
        });
        await fetch(twilioUrl, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
      } catch (smsErr) {
        console.warn("⚠️ [OTP SMS Fallback] Invio SMS fallito, procedo via Email:", smsErr);
      }
    }

    // B. Invio immediato via Email (Garantisce il recapito al 100% anche senza credito SMS)
    const htmlOtp = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
        <h2 style="color: #0f172a; margin-top: 0;">Codice di Verifica ${senderBrand}</h2>
        <p style="color: #475569; font-size: 15px;">Inserisci questo codice a 6 cifre per confermare la tua richiesta e sbloccare la priorità:</p>
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #059669; border-radius: 8px; margin: 20px 0;">
          ${token}
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Il codice scade tra 15 minuti.</p>
      </div>
    `;

    // Invio asincrono per non rallentare la risposta API del form
    sendViaGmailRotator(email, `${token} è il tuo codice di verifica ${senderBrand}`, htmlOtp, senderBrand).catch(err =>
      console.error("❌ [OTP Email Error]:", err.message)
    );

    return token;
  }

  /**
   * 4. ALGORITHM FEEDER (Invia solo i Lead QUALIFIED a Meta Conversions API & Google Ads)
   */
  static async fireAlgorithmFeeder(profileId: string) {
    try {
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        include: { tenant: true }
      });

      if (!profile || profile.status !== 'QUALIFIED') return;

      const { tenant } = profile;
      const hashSha256 = (val: string) => crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');

      // A. Meta Conversions API (CAPI)
      if (tenant.metaPixelId && tenant.metaCapiToken) {
        const metaPayload = {
          data: [
            {
              event_name: 'Lead',
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'system_generated',
              user_data: {
                em: [hashSha256(profile.email)],
                ...(profile.phone ? { ph: [hashSha256(profile.phone.replace(/\D/g, ''))] } : {}),
                ...(profile.lastIp ? { client_ip_address: profile.lastIp } : {})
              },
              custom_data: {
                lead_event_source: 'Redi Lead System',
                icp_score: profile.icpScore,
                segment: profile.segment,
                currency: 'EUR',
                value: profile.budget || 100
              }
            }
          ]
        };

        await fetch(`https://graph.facebook.com/v19.0/${tenant.metaPixelId}/events?access_token=${tenant.metaCapiToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metaPayload)
        });
        console.log(`📡 [Algorithm Feeder] Segnale QUALIFIED inviato a Meta CAPI per ${profile.email}`);
      }

      // B. Google Ads / Custom Conversion Webhook
      if (tenant.googleConversionUrl) {
        await fetch(tenant.googleConversionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'RLS_QUALIFIED_LEAD',
            emailHash: hashSha256(profile.email),
            icpScore: profile.icpScore,
            value: profile.budget || 100,
            utmSource: profile.utmSource,
            utmCampaign: profile.utmCampaign
          })
        });
        console.log(`📡 [Algorithm Feeder] Segnale QUALIFIED inviato a Google Ads Webhook per ${profile.email}`);
      }
    } catch (error: any) {
      console.error("⚠️ [Algorithm Feeder Warning]:", error.message);
    }
  }
}