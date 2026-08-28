# FreeChat — MVP revisado

Site de conversa entre estranhos usando **HTML + CSS + JavaScript puro + Supabase**, pronto para GitHub Pages e sem Vite/build.

## Configuração obrigatória

1. Crie um projeto no Supabase.
2. Em **Authentication → Providers**, ative **Anonymous Sign-Ins**.
3. No **SQL Editor**, execute `supabase-schema.sql` inteiro.
4. Em `js/supabase.js`, substitua `SUPABASE_URL` e `SUPABASE_ANON_KEY` pelos dados públicos do projeto.
5. Publique a pasta na raiz de um repositório GitHub e ative GitHub Pages.

## Funcionalidades

- Login anônimo persistente no navegador.
- Perfil com nickname e opção **disponível para conversar**.
- Presença com heartbeat de 20 segundos e janela de 65 segundos para considerar alguém online.
- Lista de pessoas online/disponíveis com pesquisa.
- Matchmaking aleatório com proteção contra bloqueios e usuários desatualizados.
- Conversas diretas sem duplicar uma conversa ativa existente.
- Mensagens persistentes no Supabase: o destinatário pode estar offline e verá o histórico quando voltar.
- Realtime para novas mensagens e mudanças de presença.
- Caixa de entrada e contador de não lidas.
- Bloqueio e denúncia.
- RLS e RPCs com `security definer` e permissões restritas a usuários autenticados.
- Validação e escaping de texto no frontend.
- Interface responsiva com visual moderno.

## O que significa “receber mensagem offline”

A mensagem é gravada no banco mesmo que o destinatário esteja desconectado. Quando ele abrir o site novamente, o histórico é carregado. **Push notification** do sistema operacional/navegador é uma funcionalidade separada e não está incluída neste MVP.

## Presença

O navegador não garante que `beforeunload/pagehide` consiga executar uma gravação antes de fechar a página. Por isso, a aplicação também usa `last_seen` e considera o usuário offline quando o heartbeat fica desatualizado.

## Segurança

O frontend nunca deve ser tratado como autoridade. O SQL valida o usuário autenticado, participação na conversa, estado ativo, bloqueios e disponibilidade. A chave `anon`/pública do Supabase pode ficar no frontend; **service_role key nunca deve ser colocada no GitHub ou no navegador**.

## Antes de abrir para o público

Faça testes com duas sessões/navegadores diferentes:

1. criar perfil A e B;
2. verificar A aparece online para B;
3. iniciar conversa pela lista;
4. enviar mensagens nos dois sentidos;
5. fechar B, enviar mensagem a B e abrir B novamente;
6. testar mensagens não lidas;
7. testar matchmaking com A e B simultaneamente;
8. testar bloqueio e denúncia;
9. verificar no Supabase que RLS impede acesso a conversas de terceiros.

O projeto é um **MVP funcional**, não uma plataforma de produção auditada externamente. Para escala maior, o próximo passo é trocar a presença baseada em `last_seen` por Supabase Realtime Presence e adicionar rate limiting/moderação/anti-spam no backend.
