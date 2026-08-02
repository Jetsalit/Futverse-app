export function generateFutId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluded O, 0, I, 1 for readability
  let randomStr = "";
  for (let i = 0; i < 6; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `FUT-${year}-${randomStr}`;
}

export function getBMICategory(bmiValue: number | string | undefined | null) {
  if (!bmiValue) return null;
  const bmi = typeof bmiValue === 'string' ? parseFloat(bmiValue) : bmiValue;
  if (isNaN(bmi)) return null;

  if (bmi < 18.5) return { label: "น้ำหนักต่ำกว่าเกณฑ์", color: "text-amber-600 bg-amber-50 border-amber-200" };
  if (bmi >= 18.5 && bmi <= 22.9) return { label: "สมส่วน", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (bmi >= 23 && bmi <= 24.9) return { label: "น้ำหนักเกิน (ท้วม)", color: "text-orange-600 bg-orange-50 border-orange-200" };
  if (bmi >= 25 && bmi <= 29.9) return { label: "โรคอ้วนระดับ 1", color: "text-rose-600 bg-rose-50 border-rose-200" };
  return { label: "โรคอ้วนระดับ 2", color: "text-rose-700 bg-rose-100 border-rose-300" };
}
