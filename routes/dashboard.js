const express = require('express');
const router = express.Router();
const db = require('../db');
router.get("/stats", async (req, res) => {
  try {
    // Total buses created today
    const [buses] = await db.query(`
    SELECT COUNT(DISTINCT b.bus_name) as total
    FROM buses b
    JOIN bookings bk ON b.id = bk.bus_id
    WHERE DATE(bk.created_at) = CURDATE()
      AND bk.status IN ('Paid', 'Unpaid')
  `);
  
    // Bookings today with status Paid or Unpaid
    const [bookings] = await db.query(
      "SELECT COUNT(*) as today FROM bookings WHERE DATE(created_at) = CURDATE() AND status IN ('Paid', 'Unpaid')"
    );

    // Passengers created today
    const [passengers] = await db.query(`
  SELECT SUM(p.nop) as total
  FROM passengers p
  JOIN bookings bk ON bk.passengerId = p.id
  WHERE DATE(bk.created_at) = CURDATE()
    AND bk.status IN ('Paid', 'Unpaid')
`);

    // Payments today for Paid or Unpaid bookings only (join with bookings)
    const [commission] = await db.query(
      `SELECT SUM(p.amount) as total, SUM(p.extra) as extra
       FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE DATE(p.created_at) = CURDATE()
       AND b.status IN ('Paid', 'Unpaid')`
    );

    res.json({
      totalBuses: buses[0]?.total || 0,
      bookingsToday: bookings[0]?.today || 0,
      totalPassengers: passengers[0]?.total || 0,
      commission: commission[0]?.total * 0.1 || 0,
      extra: commission[0]?.extra || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching stats" });
  }
});

// ✅ Weekly Commission Chart (only Paid/Unpaid)
router.get("/weekly-commission", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DAYNAME(p.created_at) as day, 
        SUM(p.amount) as total
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      AND b.status IN ('Paid', 'Unpaid')
      GROUP BY day
      ORDER BY FIELD(day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching weekly commission" });
  }
});


  // ✅ API: Recent Activities
  router.get("/activities", async (req, res) => {
    try {
      const [rows] = await db.query(
        "SELECT message FROM activities WHERE DATE(created_at) = CURDATE() ORDER BY created_at DESC LIMIT 10"
      );
      res.json(rows.map((r) => r.message));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error fetching activities" });
    }
  });

module.exports = router;