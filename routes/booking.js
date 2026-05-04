const express = require("express");
const router = express.Router();
const db = require("../db");
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');

const chromium = require('@sparticuz/chromium');
// ✅ Create booking (with passenger + booking + payment)
router.post("/book", async (req, res) => {
  const {
    name,
    age,
    gender,
    mobile,
    jdate,
    from,
    to,
    boarding,
    dropping,
    fare,
    extra,
    paymode,
    status,
    BusName,
    BusNo,
    noofpassenger,
    seatno,
    pnr,
    GpayNo,
  } = req.body;

  try {
    // 1️⃣ Insert passenger
    const [passengerResult] = await db.query(
      "INSERT INTO passengers (name, mobile, age, gender, nop) VALUES (?, ?, ?, ?, ?)",
      [name, mobile, age, gender, noofpassenger]
    );
    const passengerId = passengerResult.insertId;

    // 2️⃣ Insert bus detail
    const [busesdetail] = await db.query(
      "INSERT INTO buses (bus_number, bus_name, passengerId, seatno) VALUES (?, ?, ?, ?)",
      [BusNo, BusName, passengerId, seatno]
    );
    const busId = busesdetail.insertId;

    // 3️⃣ Insert booking
    const [bookingResult] = await db.query(
      `INSERT INTO bookings 
        (passengerId, bus_id, created_at, pnr, from_city, to_city, journey_date, boarding_ponit, droping_ponit, status) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [passengerId, busId, pnr, from, to, jdate, boarding, dropping, status]
    );
    const bookingId = bookingResult.insertId;

    // 4️⃣ Insert payment
    await db.query(
      "INSERT INTO payments (booking_id, amount, extra, gpayno, created_at, paymode) VALUES (?, ?, ?, ?, NOW(), ?)",
      [bookingId, fare, extra, GpayNo, paymode]
    );

    // 5️⃣ Log activity
    await db.query("INSERT INTO activities (message) VALUES (?)", [
      `Ticket booked for ${name}, PNR ${pnr}`,
    ]);

    // 6️⃣ Generate PDF ticket
    const templatePath = path.join(__dirname, "../templates/bluebusticket3.html");
    const templateHtml = fs.readFileSync(templatePath, "utf-8");
    const template = handlebars.compile(templateHtml);

    const fare1 = extra !== "" ? "PAID" : fare;
    const created_at = new Date();

    const html = template({
      pname: name,
      page: age,
      gender: gender,
      busNo: BusNo,
      busName: BusName,
      form_city: from,
      to_city: to,
      bpoint: boarding,
      dpoint: dropping,
      jdate: jdate,
      fare1: fare1,
      created_at: created_at,
      seatNo: seatno,
      pnr: pnr,
    });

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    // 7️⃣ Send PDF to client immediately
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${pnr}.pdf"`,
      "X-Booking-Meta": JSON.stringify({ pnr }),
    });
    res.send(pdfBuffer);

    // 8️⃣ Send PDF via WhatsApp asynchronously
    

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Error creating booking" });
    }
  }
});
// 📌 Get Ticket PDF by Booking ID
router.get("/ticket/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch booking details (join passengers, buses, payments)
    const [rows] = await db.query(
      `SELECT b.id AS bookingId, b.pnr, DATE_FORMAT(b.journey_date, '%Y-%m-%d') as journey_date, b.from_city, b.to_city, 
              b.boarding_ponit, b.droping_ponit, b.status,
              p.name, p.age, p.gender, p.mobile, 
              bus.bus_number, bus.bus_name, bus.seatno,
              pay.amount, pay.extra, pay.paymode, pay.gpayno,p.mobile, DATE_FORMAT(pay.created_at, '%Y-%m-%d') as created_at
       FROM bookings b
       JOIN passengers p ON b.passengerId = p.id
       JOIN buses bus ON b.bus_id = bus.id
       LEFT JOIN payments pay ON b.id = pay.booking_id
       WHERE b.id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const booking = rows[0];

    // 2. Load & compile template
    const templatePath = path.join(__dirname, "../templates/bluebusticket3.html");
    const templateHtml = fs.readFileSync(templatePath, "utf-8");
    const template = handlebars.compile(templateHtml);

    const html = template({
      pname: booking.name,
      page: booking.age,
      gender: booking.gender,
      busNo: booking.bus_number,
      busName: booking.bus_name,
      form_city: booking.from_city,
      to_city: booking.to_city,
      bpoint: booking.boarding_ponit,
      dpoint: booking.droping_ponit,
      jdate: booking.journey_date,
      fare1: booking.extra !== "" ? "PAID" : booking.amount,
      created_at: booking.created_at,
      seatNo: booking.seatno,
      pnr: booking.pnr,
    });

    // 3. Generate PDF with Puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    // 4. Return PDF as Base64 (for frontend download)
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${booking.pnr}.pdf"`,
     
    });

    res.send(pdfBuffer);
    // === After generating pdfBuffer ===
    

  } catch (error) {
    console.error("Error generating ticket:", error);
    res.status(500).json({ success: false, message: "Error generating ticket" });
  }
});


router.get("/booking", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        b.pnr,
        p.name,
        DATE_FORMAT(b.journey_date, '%Y-%m-%d') AS jdate,
        b.from_city AS \`from\`,
        b.to_city AS \`to\`,
        pay.amount,
        pay.extra,
        pay.paymode,
        b.status
       FROM bookings b
       JOIN passengers p ON b.passengerId = p.id
       JOIN buses bu ON b.passengerId = bu.passengerId
       JOIN payments pay ON b.id =  pay.booking_id
       ORDER BY b.journey_date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// ✅ Get booking by PNR
router.get('/pnr/:pnr', async (req, res) => {
  const { pnr } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT b.id, b.pnr, b.from_city, b.to_city, DATE_FORMAT(b.journey_date, '%Y-%m-%d') as journey_date, b.boarding_ponit, b.droping_ponit, b.status, 
              p.name, p.email, p.mobile,p.age,p.gender, pay.amount, pay.paymode
       FROM bookings b
       JOIN passengers p ON b.passengerId = p.id
       JOIN payments pay ON pay.booking_id = b.id
       WHERE b.pnr = ? OR p.mobile = ?`,
      [pnr,pnr]
    );
    if (rows.length === 0) return res.status(404).json({ message: "PNR not found" });
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching booking" });
  }
});
// In routes/booking.js
router.put('/cancel/:pnr', async (req, res) => {
  const { pnr } = req.params;
  const { reason } = req.body; // Get cancellation reason

  try {
    // 1. Update booking status and optionally store reason
    const [result] = await db.query(
      "UPDATE bookings SET status = 'Cancel', Reason = ? WHERE pnr = ?",
      [reason || null, pnr]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }

    // 2. Optional: log cancellation activity
    await db.query(
      "INSERT INTO activities (message) VALUES (?)",
      [`Booking with PNR ${pnr} cancelled. Reason: ${reason || "Not provided"}`]
    );

    return res.json({ message: "Booking cancelled successfully." });
  } catch (err) {
    console.error("Cancel error:", err);
    return res.status(500).json({ error: "Server error during cancellation." });
  }
});

// GET /api/bookings?date=2025-09-08
router.get('/bookings', async (req, res) => {
  const { date } = req.query;
  

  if (!date) {
    return res.status(400).json({ error: "Date query parameter is required" });
  }
  
  try {
    const [rows] = await db.query(
      `SELECT 
      DATE_FORMAT(b.journey_date, '%Y-%m-%d') AS journey_date, 
         bu.bus_name AS busName, 
         b.pnr,
         b.id,
         b.status,
         b.from_city AS fromCity,
         bu.bus_number AS busNo,  
         bu.seatno AS seatNo,
         p.name AS passenger,
         p.mobile AS mobile
       FROM bookings b
       JOIN passengers p ON b.passengerId = p.id
       JOIN buses bu ON b.passengerId = bu.passengerId
       WHERE DATE(b.created_at) = ? OR DATE(b.journey_date) = ?`,
      [date,date]
    );
    

    res.json(rows);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: "Server error while fetching bookings" });
  }
});
router.put("/bookings/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const [result] = await db.query(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({ message: "Booking status updated successfully", status });
  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/station", async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM stations`);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Stations not found" });
    }

    res.json(rows); // ✅ return full array of stations

  } catch (error) {
    console.error("Error fetching stations:", error);
    res.status(500).json({ message: "Error fetching stations" });
  }
});


module.exports = router;
