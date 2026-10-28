// ملف توافق بديل لنظام Supabase
export const db: any = {};
export const auth: any = {};

export async function changeAccountPassword(...args: any[]) {
  console.log('Password change handled via Supabase');
  return true;
}

export default {};
