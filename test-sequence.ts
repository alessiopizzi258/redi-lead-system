import 'dotenv/config';
import { prisma } from './src/lib/prisma';
import { DeliveryService } from './src/lib/services/deliveryService';

// Funzione che inietta il testo puro in un layout lusso ad alta conversione
function buildPremiumTemplate(content: string) {
  // Aggiungiamo spaziature per rendere il testo arioso e leggibile
  const formattedContent = content.replace(/\. /g, '.<br><br>');

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"></head>
  <body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7f6; padding: 40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
            <!-- HEADER -->
            <tr>
              <td style="background-color: #113b36; text-align: center; padding: 30px;">
                <h1 style="color: #cfff04; margin: 0; font-size: 28px; letter-spacing: 1px;">Scintilla Energy</h1>
                <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 14px; opacity: 0.8; letter-spacing: 2px;">ACCENDIAMO CONNESSIONI</p>
              </td>
            </tr>
            <!-- BODY -->
            <tr>
              <td style="padding: 40px 40px 20px 40px; color: #333333; font-size: 16px; line-height: 1.8;">
                ${formattedContent}
              </td>
            </tr>
            <!-- CTA BUTTON -->
            <tr>
              <td style="padding: 0 40px 40px 40px; text-align: center;">
                <a href="https://wa.me/390883360050" style="background-color: #cfff04; color: #113b36; padding: 16px 32px; text-decoration: none; font-weight: bold; font-size: 18px; border-radius: 6px; display: inline-block; border: 2px solid #113b36;">
                  ATTIVA LA PROMO ORA
                </a>
              </td>
            </tr>
            <!-- FOOTER -->
            <tr>
              <td style="background-color: #eeeeee; padding: 20px; text-align: center; font-size: 12px; color: #777777;">
                <p style="margin: 0 0 5px 0;"><b>Scintilla Hub</b> | Via Giovanni Boccaccio, 51 - 70026 Barletta (BT)</p>
                <p style="margin: 0;">Hai ricevuto questa email perché hai richiesto informazioni. <a href="#" style="color: #777777; text-decoration: underline;">Disiscriviti</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

async function main() {
  console.log("🔍 Recupero la sequenza e inietto il layout premium...");

  const sequence = await prisma.sequence.findFirst({
    where: { name: "Promo Luce Fix - Scintilla Hub" },
    include: { emails: { orderBy: { stepNumber: 'asc' } }, tenant: true }
  });

  if (!sequence || sequence.emails.length === 0) return;

  const targetEmail = "alessiopizzi258@gmail.com";

  for (const template of sequence.emails) {
    console.log(`⏳ Invio Step ${template.stepNumber}...`);

    // Iniezione del testo nel master wrapper
    const bodyHtml = buildPremiumTemplate(template.plainText);

    await DeliveryService.sendColdEmailToProspect(
      sequence.tenantId,
      targetEmail,
      template.subject,
      bodyHtml
    );

    console.log(`✅ Step ${template.stepNumber} inviato.`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

main().finally(() => prisma.$disconnect());