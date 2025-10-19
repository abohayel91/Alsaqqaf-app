
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Sessions for admin auth
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret_session_key_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 6 } // 6 hours
}));

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// Files
const DATA_FILE = path.join(__dirname, "applications.json");
const PDF_DIR = path.join(__dirname, "pdfs");
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

// Auth helpers
const ADMIN_USER = process.env.ADMIN_USER || "salemmohsin313@gmail.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "Alsaqqaf313$$";

function isAuthed(req) { return req.session && req.session.authed === true; }
function requireAuth(req, res, next) { if (isAuthed(req)) return next(); return res.redirect("/admin/login"); }

// Static public
app.use(express.static(path.join(__dirname, "public")));

// Admin auth routes
app.get("/admin/login", (req, res) => { res.sendFile(path.join(__dirname, "public", "admin", "login.html")); });
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) { req.session.authed = true; return res.redirect("/admin"); }
  return res.status(401).send(`<script>alert('Invalid credentials');window.location='/admin/login';</script>`);
});
app.post("/admin/logout", (req, res) => { req.session.destroy(() => res.redirect("/admin/login")); });

// Protect admin UI & APIs
app.get("/admin", requireAuth, (req, res) => { res.sendFile(path.join(__dirname, "public", "admin", "index.html")); });

// Helpers
function readApps() { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]"); } catch { return []; } }
function writeApps(apps) { fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2), "utf8"); }

function addLine(doc, label, val) { doc.fontSize(12).text(`${label}: ${val || ""}`); }
function section(doc, title) { doc.moveDown(0.5); doc.fontSize(15).text(title, { underline: true }); doc.moveDown(0.25); doc.fontSize(12); }

function drawHeader(doc) {
  const logoPath = path.join(__dirname, "public", "logo.png");
  if (fs.existsSync(logoPath)) { try { doc.image(logoPath, 50, 35, { fit: [150, 70] }); } catch {} }
  doc.fontSize(20).text("ALSAQQAF LOGISTICS LLC - Driver Application", 0, 40, { align: "right" });
  doc.moveDown(2.2);
}
function drawFooter(doc) {
  const footerText = "© ALSAQQAF LOGISTICS LLC";
  const y = doc.page.height - 40;
  doc.fontSize(10);
  doc.text(footerText, 0, y, { align: "center", width: doc.page.width });
}

async function generatePdf(appData) {
  const id = appData.id || uuidv4();
  const first = (appData.firstName || "Driver").trim().replace(/\s+/g, "_");
  const last = (appData.lastName || "Application").trim().replace(/\s+/g, "_");
  const filename = `${first}_${last}_${id}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const doc = new PDFDocument({ margin: 50, autoFirstPage: true });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  // Header & footer on the first page
  drawHeader(doc);
  drawFooter(doc);

  // Ensure header/footer on every additional page
  doc.on("pageAdded", () => { drawHeader(doc); drawFooter(doc); });

  doc.fontSize(12).text(`Submission ID: ${id}`);
  doc.text(`Submitted: ${new Date(appData.submittedAt || Date.now()).toLocaleString()}`);

  section(doc, "Personal Information");
  addLine(doc, "First Name", appData.firstName);
  addLine(doc, "Middle Name", appData.middleName);
  addLine(doc, "Last Name", appData.lastName);
  addLine(doc, "Email", appData.email);
  addLine(doc, "Phone", appData.phone);
  addLine(doc, "Date of Birth", appData.dateOfBirth);
  addLine(doc, "SSN (masked)", appData.ssn ? String(appData.ssn).replace(/^(\d{3})\d{2}(\d{4})$/, "$1-XX-$2") : "");

  section(doc, "Address");
  addLine(doc, "Street", appData.currentAddress);
  addLine(doc, "City", appData.currentCity);
  addLine(doc, "State", appData.currentState);
  addLine(doc, "ZIP", appData.currentZip);

  section(doc, "Experience & Preferences");
  addLine(doc, "CDL Class", appData.cdlClass);
  addLine(doc, "Driving Experience", appData.drivingExperience);
  addLine(doc, "Owner Operator", appData.ownerOperator || appData.ownerOperatorStep4);
  addLine(doc, "Work Schedule", appData.workSchedule);
  addLine(doc, "Available Start Date", appData.availableStartDate);

  section(doc, "Emergency Contact");
  addLine(doc, "Name", appData.emergencyName);
  addLine(doc, "Relationship", appData.emergencyRelationship);
  addLine(doc, "Phone", appData.emergencyPhone);
  addLine(doc, "Email", appData.emergencyEmail);

  doc.end();
  await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  return { filepath, filename };
}

async function emailPdf(filepath, filename, appData) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const to = process.env.EMAIL_TO || "salemmohsin313@gmail.com";
  const from = process.env.EMAIL_FROM || "ALSAQQAF Logistics <no-reply@example.com>";
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) { console.log("SMTP not configured; skipping email."); return; }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({
    from, to, subject: `New Driver Application: ${(appData.firstName||"").trim()} ${(appData.lastName||"").trim()}`.trim(),
    text: "New driver application attached.", html: `<p>New driver application from <b>${(appData.firstName||"").trim()} ${(appData.lastName||"").trim()}</b>.</p>`,
    attachments: [{ filename, path: filepath }]
  });
}

// Public API to submit application
app.post("/api/applications", async (req, res) => {
  try {
    const data = req.body || {};
    const required = ["firstName","lastName","email","phone"];
    const miss = required.filter(k => !data[k]);
    if (miss.length) return res.status(400).json({ error: "Missing required fields", miss });

    data.id = uuidv4();
    data.submittedAt = Date.now();

    const apps = readApps();
    apps.unshift(data);
    writeApps(apps);

    const { filepath, filename } = await generatePdf(data);
    await emailPdf(filepath, filename, data);

    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Admin APIs (protected)
app.get("/api/applications", requireAuth, (req, res) => { res.json(readApps()); });
app.get("/api/applications/:id/pdf", requireAuth, (req, res) => {
  const apps = readApps();
  const appData = apps.find(a => a.id === req.params.id);
  if (!appData) return res.status(404).json({ error: "Not found" });
  const list = fs.readdirSync(PDF_DIR).filter(n => n.includes(appData.id));
  if (list.length) return res.sendFile(path.join(PDF_DIR, list[0]));
  generatePdf(appData).then(({ filepath }) => res.sendFile(filepath));
});

// Catch-all to driver form
app.get("/", (req,res)=> res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log("Server running on port", PORT));
