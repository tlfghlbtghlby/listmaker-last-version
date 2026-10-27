import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://obodoxxzolgcwvzkkoua.supabase.co';
export const supabaseAnonKey = 'sb_publishable_0aNPlD59KqYsmVr8r_tMEw_wpgmlj2o';

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

// دالة الاستماع اللحظي للتعديلات
export function subscribeToDocument(collectionName: string, docId: string, callback: (data: any) => void) {
  const channel = supabase
    .channel(`realtime:${collectionName}:${docId}`)
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

  return {
    unsubscribe: () => supabase.removeChannel(channel)
  };
}
