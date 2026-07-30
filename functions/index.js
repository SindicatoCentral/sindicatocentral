const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();
const zohoPassword = defineSecret("ZOHO_PASSWORD");

function calcularAntiguedad(fechaIngreso) {
  const hoy = new Date();
  const ingreso = new Date(fechaIngreso);
  let anios = hoy.getFullYear() - ingreso.getFullYear();
  let meses = hoy.getMonth() - ingreso.getMonth();
  if (meses < 0) { anios--; meses += 12; }
  if (anios === 0) return meses + " mes" + (meses !== 1 ? "es" : "");
  return anios + " año" + (anios !== 1 ? "s" : "") + (meses > 0 ? " y " + meses + " mes" + (meses !== 1 ? "es" : "") : "");
}

exports.cumpleanosdiarios = onSchedule(
  {
    schedule: "0 10 * * *",
    timeZone: "America/Santiago",
    secrets: [zohoPassword],
  },
  async () => {
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.getMonth() + 1;
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    const snap = await db.collection("socios").get();
    const cumpleaneros = [];
    snap.forEach((doc) => {
      const s = doc.data();
      if (!s.fechaNacimiento) return;
      const fecha = new Date(s.fechaNacimiento);
      const desvinculado = (s.entregaTarjeta || "").toLowerCase().trim() === "desvinculado";
      if (fecha.getDate() === dia && fecha.getMonth() + 1 === mes && !desvinculado) {
        cumpleaneros.push(s);
      }
    });

    if (cumpleaneros.length === 0) return;

    const transporter = nodemailer.createTransport({
      host: "smtppro.zoho.com",
      port: 465,
      secure: true,
      auth: {
        user: "trabajadores@sindicatocentral.cl",
        pass: zohoPassword.value(),
      },
    });

    const listaHTML = cumpleaneros.map((s) => {
      const antiguedad = s.fechaIngreso ? calcularAntiguedad(s.fechaIngreso) : "—";
      return `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;font-weight:600;color:#1C2B3A;">${s.nombre}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;color:#555;">${s.rut || "—"}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;color:#555;">${s.cargo || "—"}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;color:#2E5F8A;font-weight:600;">${antiguedad}</td>
        </tr>
      `;
    }).join("");

    const fechaStr = `${dia} de ${meses[mes - 1]} de ${hoy.getFullYear()}`;

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0"
            style="max-width:600px;width:100%;background:#fff;border-radius:4px;
            overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#1C2B3A;padding:28px 40px;text-align:center;">
                <div style="color:#fff;font-size:11px;letter-spacing:.15em;
                  text-transform:uppercase;opacity:.7;margin-bottom:6px;">
                  Sindicato de Trabajadores</div>
                <div style="color:#fff;font-size:22px;font-weight:700;">
                  UNIVERSIDAD CENTRAL</div>
                <div style="width:40px;height:2px;background:#2E5F8A;margin:12px auto 0;"></div>
              </td>
            </tr>
            <tr>
              <td style="background:#e65100;padding:12px 40px;">
                <div style="color:#fff;font-size:13px;font-weight:700;">
                  🎂 Cumpleaños del día — ${fechaStr}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px;">
                <p style="font-size:14px;color:#444;margin:0 0 20px;">
                  Los siguientes socios cumplen años hoy.
                  Recuerda verificar su antigüedad antes de enviar la gift card.</p>
                <table width="100%" cellpadding="0" cellspacing="0"
                  style="border:1px solid #eee;border-radius:3px;overflow:hidden;">
                  <thead>
                    <tr style="background:#f8f9fa;">
                      <th style="padding:10px 16px;text-align:left;font-size:11px;
                        color:#888;text-transform:uppercase;">Nombre</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;
                        color:#888;text-transform:uppercase;">RUT</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;
                        color:#888;text-transform:uppercase;">Cargo</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;
                        color:#888;text-transform:uppercase;">Antigüedad</th>
                    </tr>
                  </thead>
                  <tbody>${listaHTML}</tbody>
                </table>
                <div style="margin-top:20px;padding:12px 16px;background:#fff8e1;
                  border-left:3px solid #e65100;border-radius:2px;font-size:13px;color:#555;">
                  ⚠️ Recuerda verificar el estado de las cuotas sindicales
                  antes de gestionar la gift card.
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#f0f4f8;padding:16px 40px;
                text-align:center;border-top:1px solid #e0e6ed;">
                <div style="font-size:11px;color:#999;">
                  Aviso automático generado por
                  <strong style="color:#2E5F8A;">www.sindicatocentral.cl</strong>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;

    await transporter.sendMail({
      from: "\"Sindicato Central\" <trabajadores@sindicatocentral.cl>",
      to: "trabajadores@sindicatocentral.cl, tesorero@sindicatocentral.cl",
      subject: `🎂 Cumpleaños del día — ${fechaStr}`,
      html,
    });

    console.log(`Correo enviado: ${cumpleaneros.length} cumpleañero(s) el ${fechaStr}`);
  }
);