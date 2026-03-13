const fs = require("fs");

// Helper: parse "hh:mm:ss am/pm" to total seconds (0-86400)
function parseTimeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;
    const trimmed = timeStr.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/i);
    if (!match) return 0;
    let [, h, m, s, period] = match;
    h = parseInt(h, 10);
    m = parseInt(m, 10);
    s = parseInt(s, 10);
    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;
    return h * 3600 + m * 60 + s;
}

// Helper: format total seconds as "h:mm:ss" or "hhh:mm:ss"
function formatSecondsToTime(totalSeconds) {
    if (totalSeconds < 0 || isNaN(totalSeconds)) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Helper: parse "h:mm:ss" or "hhh:mm:ss" to total seconds
function parseDurationToSeconds(durStr) {
    if (!durStr || typeof durStr !== "string") return 0;
    const parts = durStr.trim().split(":").map(Number);
    if (parts.length < 3) return 0;
    const total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return isNaN(total) ? 0 : total;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSec = parseTimeToSeconds(startTime);
    let endSec = parseTimeToSeconds(endTime);
    if (endSec <= startSec) endSec += 24 * 3600; // next day
    return formatSecondsToTime(endSec - startSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// Delivery hours: 8:00 AM - 10:00 PM (inclusive)
// ============================================================
function getIdleTime(startTime, endTime) {
    const DELIVERY_START = 8 * 3600;   // 8:00 AM
    const DELIVERY_END = 22 * 3600;    // 10:00 PM
    let startSec = parseTimeToSeconds(startTime);
    let endSec = parseTimeToSeconds(endTime);
    if (endSec <= startSec) endSec += 24 * 3600;
    let idle = 0;
    if (startSec < DELIVERY_START) {
        const clip = Math.min(endSec, DELIVERY_START);
        idle += clip - startSec;
    }
    if (endSec > DELIVERY_END) {
        const clipStart = Math.max(startSec, DELIVERY_END);
        idle += endSec - clipStart;
    }
    return formatSecondsToTime(idle);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = parseDurationToSeconds(shiftDuration);
    const idleSec = parseDurationToSeconds(idleTime);
    return formatSecondsToTime(Math.max(0, shiftSec - idleSec));
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// Eid period: April 10-30, 2025, quota = 6h; else 8h24m
// ============================================================
function metQuota(date, activeTime) {
    if (!date || !activeTime) return false;
    const parts = date.trim().split("-").map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    const activeSec = parseDurationToSeconds(activeTime);
    const isEid = y === 2025 && m === 4 && d >= 10 && d <= 30;
    const quotaSec = isEid ? 6 * 3600 : (8 * 3600 + 24 * 60);
    return activeSec >= quotaSec;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const driverID = String(shiftObj.driverID).trim();
    const date = String(shiftObj.date).trim();
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length >= 3 && cols[0].trim() === driverID && cols[2].trim() === date) {
            return {};
        }
    }
    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const met = metQuota(date, activeTime);
    const hasBonus = false;
    const newRow = [
        driverID,
        shiftObj.driverName,
        date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        String(met),
        String(hasBonus)
    ].join(",");
    let insertIdx = lines.length;
    for (let i = lines.length - 1; i >= 1; i--) {
        const cols = lines[i].split(",");
        if (cols.length >= 1 && cols[0].trim() === driverID) {
            insertIdx = i + 1;
            break;
        }
    }
    const before = lines.slice(0, insertIdx).join("\n");
    const after = lines.slice(insertIdx).join("\n");
    const newContent = after ? before + "\n" + newRow + "\n" + after : before + "\n" + newRow;
    fs.writeFileSync(textFile, newContent, { encoding: "utf8" });
    return {
        driverID,
        driverName: shiftObj.driverName,
        date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: met,
        hasBonus
    };
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/);
    const id = String(driverID).trim();
    const dt = String(date).trim();
    const val = String(newValue);
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length >= 10 && cols[0].trim() === id && cols[2].trim() === dt) {
            cols[9] = val;
            lines[i] = cols.join(",");
            break;
        }
    }
    fs.writeFileSync(textFile, lines.join("\n"), { encoding: "utf8" });
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const id = String(driverID).trim();
    const monthNum = parseInt(String(month), 10);
    const monthNorm = isNaN(monthNum) ? "00" : String(monthNum).padStart(2, "0");
    let foundDriver = false;
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 10) continue;
        if (cols[0].trim() !== id) continue;
        foundDriver = true;
        const rowMonth = cols[2].trim().split("-")[1] || "";
        const rowMonthNorm = String(parseInt(rowMonth, 10)).padStart(2, "0");
        if (rowMonthNorm === monthNorm && cols[9].trim().toLowerCase() === "true") {
            count++;
        }
    }
    return foundDriver ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const id = String(driverID).trim();
    const monthNorm = String(Number(month)).padStart(2, "0");
    let totalSec = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 8) continue;
        if (cols[0].trim() !== id) continue;
        const rowMonth = String(parseInt((cols[2].trim().split("-")[1] || ""), 10));
        if (rowMonth !== String(Number(month))) continue;
        totalSec += parseDurationToSeconds(cols[7].trim());
    }
    return formatSecondsToTime(totalSec);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rateContent = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateContent.split(/\r?\n/).filter((l) => l.trim());
    let dayOff = "";
    for (let i = 0; i < rateLines.length; i++) {
        const cols = rateLines[i].split(",");
        if (cols.length >= 2 && cols[0].trim() === String(driverID).trim()) {
            dayOff = cols[1].trim();
            break;
        }
    }
    const shiftsContent = fs.readFileSync(textFile, { encoding: "utf8" });
    const shiftLines = shiftsContent.split(/\r?\n/).filter((l) => l.trim());
    const id = String(driverID).trim();
    const monthNum = Number(month);
    const QUOTA_NORMAL = 8 * 3600 + 24 * 60;
    const QUOTA_EID = 6 * 3600;
    let totalSec = 0;
    for (let i = 1; i < shiftLines.length; i++) {
        const cols = shiftLines[i].split(",");
        if (cols.length < 3 || cols[0].trim() !== id) continue;
        const dateStr = cols[2].trim();
        const dateParts = dateStr.split("-");
        if (dateParts.length < 3) continue;
        const y = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const d = parseInt(dateParts[2], 10);
        if (isNaN(m) || m !== monthNum) continue;
        const dt = new Date(y, m - 1, d);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[dt.getDay()];
        if (dayName === dayOff) continue;
        const isEid = y === 2025 && m === 4 && d >= 10 && d <= 30;
        totalSec += isEid ? QUOTA_EID : QUOTA_NORMAL;
    }
    totalSec -= bonusCount * 2 * 3600;
    totalSec = Math.max(0, totalSec);
    return formatSecondsToTime(totalSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const content = fs.readFileSync(rateFile, { encoding: "utf8" });
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const id = String(driverID).trim();
    let basePay = 0;
    let tier = 0;
    for (const line of lines) {
        const cols = line.split(",");
        if (cols.length >= 4 && cols[0].trim() === id) {
            basePay = parseInt(cols[2].trim(), 10);
            tier = parseInt(cols[3].trim(), 10);
            break;
        }
    }
    const ALLOWED = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = ALLOWED[tier] ?? 0;
    const reqSec = parseDurationToSeconds(requiredHours);
    const actSec = parseDurationToSeconds(actualHours);
    if (actSec >= reqSec) return basePay;
    const missingSec = reqSec - actSec;
    const missingHours = missingSec / 3600;
    const billableMissing = Math.max(0, Math.floor(missingHours) - allowed);
    const deductionRate = Math.floor(basePay / 185);
    const salaryDeduction = billableMissing * deductionRate;
    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
