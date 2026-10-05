/* Campus Connect — configuration du mode live (SPEC §9).
 *
 * Clés vides → mode local : l'app fonctionne seule sur l'appareil (localStorage), sans réseau.
 * Clés remplies → mode live : inscriptions, participations, activités et connexions sont partagées
 * en direct entre tous les téléphones via Supabase.
 *
 * À copier depuis le dashboard Supabase (Project Settings → API) :
 *   supabaseUrl     : « Project URL », par ex. https://xxxx.supabase.co
 *   supabaseAnonKey : la clé publique « anon » / « publishable » (sb_publishable_…).
 * Cette clé est publique par conception : elle finit dans le code du site.
 * Ne colle JAMAIS ici la clé « service_role » / « secret » (sb_secret_…).
 */
window.CC = window.CC || {};
window.CC.config = {
  supabaseUrl: 'https://ndtderfssqumrkajnxnj.supabase.co',
  supabaseAnonKey: 'sb_publishable_tWr90rLw0m_yyjnKxgaVpQ_wQ2gKmX5'
};
