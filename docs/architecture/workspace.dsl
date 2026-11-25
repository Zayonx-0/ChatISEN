workspace extends c4.dsl {
    views {
        image chat "08-compose" {
            title "08 · Construire la pile Compose locale"
            image svg/08-compose.svg
        }
        image conversations "11-groupes" {
            title "11 · Qui peut modifier un groupe ?"
            image svg/11-groupes.svg
        }
        image db "12-donnees-chat" {
            title "12 · PostgreSQL — identité et messagerie"
            image svg/12-donnees-chat.svg
        }
        image db "13-donnees-media" {
            title "13 · PostgreSQL — appels, fichiers et mesures"
            image svg/13-donnees-media.svg
        }
        image api "14-http-identite-groupes" {
            title "14 · Contrat HTTP v1 — comptes et conversations"
            image svg/14-http-identite-groupes.svg
        }
        image api "15-http-flux-appels" {
            title "15 · Contrat v1 — messages, événements et appels"
            image svg/15-http-flux-appels.svg
        }
        image localCalls "17-appel-direct" {
            title "17 · Un appel à deux dans le profil standalone"
            image svg/17-appel-direct.svg
        }
        image chat "19-exploitation" {
            title "19 · Sondes, métriques et Grafana"
            image svg/19-exploitation.svg
        }
        image chat "20-api-locales" {
            title "20 · Les interfaces /api non versionnées"
            image svg/20-api-locales.svg
        }
        image web "21-ecrans" {
            title "21 · Écrans ordinateur et mobile"
            image svg/21-ecrans.svg
        }
        image chat "22-recette" {
            title "22 · Recette et couverture du sujet"
            image svg/22-recette.svg
        }
    }
}
