
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// static assets
app.use(express.static(path.join(__dirname, "public")));

// storage files
const DATA_FILE = path.join(__dirname, "applications.json");
const PDF_DIR = path.join(__dirname, "pdfs");
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// ensure applications.json exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function readApplications() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Failed to read applications.json", e);
    return [];
  }
}

function writeApplications(apps) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2), "utf8");
}

// Generate a PDF for an application and return the filepath
function generatePdf(appData) {
  const id = appData.id || uuidv4();
  const safeName = (appData.firstName || "Driver") + "_" + (appData.lastName || "Application");
  const filename = `${safeName.replace(/\s+/g, "_")}_${id}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(filepath);
  doc.pipe(writeStream);

  // Optional logo
  const logoPath = path.join(__dirname, "public", "logo.png");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 50, 40, { fit: [120, 60] });
    } catch {}
  }
  doc.fontSize(20).text("ALSAQQAF LOGISTICS LLC - Driver Application", { align: "right" });
  doc.moveDown(1);

  doc
    .fontSize(14)
    .text(`Submission ID: ${id}`)
    .text(`Submitted: ${new Date(appData.submittedAt || Date.now()).toLocaleString()}`)
    .moveDown();

  function section(title) {
    doc.moveDown(0.5);
    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(12);
  }

  function field(label, value) {
    doc.text(`${label}: ${value || ""}`);
  }

  section("Personal Information");
  field("First Name", appData.firstName);
  field("Last Name", appData.lastName);
  field("Email", appData.email);
  field("Phone", appData.phone);
  field("Date of Birth", appData.dateOfBirth);
  field("SSN (masked)", appData.ssn ? appData.ssn.replace(/^(\d{3})\d{2}(\d{4})$/, "$1-XX-$2") : "");

  section("Address");
  field("Street", appData.currentAddress);
  field("City", appData.currentCity);
  field("State", appData.currentState);
  field("ZIP", appData.currentZip);
  field("Years at Current Address", appData.yearsAtCurrent);

  section("Preferences");
  field("Work Schedule", appData.workSchedule);
  field("Available Start Date", appData.availableStartDate);
  field("Weekend Availability", appData.weekendAvailability);
  field("Overtime Willing", appData.overtimeWilling);
  field("Travel Tolerance", appData.travelTolerance);

  section("Emergency Contact");
  field("Name", appData.emergencyName);
  field("Relationship", appData.emergencyRelationship);
  field("Phone", appData.emergencyPhone);
  field("Email", appData.emergencyEmail);

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve({ filepath, filename }));
    writeStream.on("error", reject);
  });
}

// optional email sender using env vars
async function sendEmailWithAttachment({ to, from, subject, text, html, attachmentPath, filename }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !to || !from) {
    console.log("Email not configured. Skipping email send.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: attachmentPath
      ? [ { filename: filename || path.basename(attachmentPath), path: attachmentPath } ]
      : [],
  });

  console.log("Email sent:", info.messageId);
}

// API routes
app.get("/api/applications", (req, res) => {
  const apps = readApplications();
  res.json(apps.sort((a,b)=> (b.submittedAt||0) - (a.submittedAt||0)));
});

app.get("/api/applications/:id/pdf", (req, res) => {
  const apps = readApplications();
  const appData = apps.find(a => a.id === req.params.id);
  if (!appData) return res.status(404).json({ error: "Not found" });

  // PDFs are generated on submit, but regenerate if missing
  const expectedPrefix = `${(appData.firstName || "Driver")}_${(appData.lastName || "Application")}`.replace(/\s+/g, "_");
  const files = fs.readdirSync(PDF_DIR).filter(n => n.includes(appData.id));
  if (files.length) {
    return res.sendFile(path.join(PDF_DIR, files[0]));
  } else {
    generatePdf(appData).then(({ filepath }) => res.sendFile(filepath));
  }
});

app.post("/api/applications", async (req, res) => {
  try {
    const data = req.body || {};
    // required fields (minimal)
    const required = ["firstName","lastName","email","phone"];
    const missing = required.filter(k => !data[k]);
    if (missing.length) {
      return res.status(400).json({ error: "Missing required fields", missing });
    }

    data.id = uuidv4();
    data.submittedAt = Date.now();

    const apps = readApplications();
    apps.push(data);
    writeApplications(apps);

    // create PDF
    const { filepath, filename } = await generatePdf(data);

    // optional email
    const EMAIL_TO = process.env.EMAIL_TO;
    const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@localhost";
    if (EMAIL_TO) {
      await sendEmailWithAttachment({
        to: EMAIL_TO,
        from: EMAIL_FROM,
        subject: `New Driver Application: ${data.firstName} ${data.lastName}`,
        text: `A new application has been submitted by ${data.firstName} ${data.lastName}.`,
        html: `<p>A new application has been submitted by <strong>${data.firstName} ${data.lastName}</strong>.</p>`,
        attachmentPath: filepath,
        filename
      });
    }

    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Serve admin page at /admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
