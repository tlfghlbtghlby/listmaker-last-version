import { createClient } from '@supabase/supabase-js';

// ضع رابط المشروع ومفتاح Publishable key اللذين نسختهما سابقاً
export const supabaseUrl = 'https://obodoxxzolgcwvzkkoua.supabase.co';
export const supabaseAnonKey = 'ضع_هنا_مفتاح_sb_publishable_الخاص_بك';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// دالة لجلب وثيقة
export async function getDocument(collectionName: string, docId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('data')
    .eq('collection', collectionName)
    .eq('id', docId)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching ${collectionName}/${docId}:`, error);
    return null;
  }
  return data ? data.data : null;
}

// دالة لحفظ أو تحديث وثيقة
export async function setDocument(collectionName: string, docId: string, docData: any) {
  const { error } = await supabase
    .from('documents')
    .upsert({
      collection: collectionName,
      id: docId,
      data: docData,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error(`Error saving ${collectionName}/${docId}:`, error);
  }
}

// الاستماع اللحظي للتعديلات
export function subscribeToDocument(collectionName: string, docId: string, callback: (data: any) => void) {
  return supabase
    .channel(`public:documents:${collectionName}:${docId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `id=eq.${docId}`
      },
      (payload: any) => {
        if (payload.new && payload.new.data) {
          callback(payload.new.data);
        }
      }
    )
    .subscribe();
}
