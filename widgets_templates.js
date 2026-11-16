// Widgets dos templates do layout falso (tools/editor_web/layout_espiao.py na engine).
//
// Funções puras: recebem o nó JSON e `enviar(cmd)`, devolvem um HTMLElement.
// `cmd` segue o protocolo da ponte (ponte.py):
//   {cmd:'escrever', rna, valor, indice:null}   -> le.escrever() (POINTER por nome, índice ativo int)
//   {cmd:'operador', op, props:{}}              -> só operadores da lista OPERADORES da ponte
//   {cmd:'novo_bloco', op, rna}                 -> "+" do template_ID: cria e liga ao dono (rna do seletor)
//
// Como integrar em modelo.html:
//   1. <script src="widgets_templates.js"></script> antes do script principal.
//   2. No desenho de itens (onde hoje cai em falta()/sem_suporte), antes do fallback:
//        const w = WidgetsTemplates.criar(no, cmd => {
//          if (cmd.cmd === 'escrever') return enviar({ rna: cmd.rna }, cmd.valor, cmd.indice ?? undefined);
//          if (wsAberto()) ponte.ws.send(JSON.stringify(cmd));
//        });
//        if (w) return w;
//   3. 'grid_flow' já chega como container (itens normais), tratar como column_flow.
//   4. Usa as variáveis CSS de modelo.html (--campo, --sel, --azul, --fraco...) e as
//      classes .btn/.texto/.row. O CSS próprio é injetado uma vez (id "wt-css").
(function (global) {
  'use strict';

  const CSS = `
.wt-lista { background: #1f1f1f; border: 1px solid var(--borda, #0e0e0e); border-radius: var(--raio-p, 3px);
  overflow-y: auto; flex: 1; min-width: 0; }
.wt-item { display: flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px; cursor: pointer;
  color: var(--texto, #e3e3e3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wt-item:hover { background: var(--hover, #ffffff10); }
.wt-item.ativo { background: var(--sel, #334a6e); }
.wt-ico { color: var(--fraco, #8d8d8d); font-size: 10px; }
.wt-vazio { color: var(--fraco, #8d8d8d); padding: 4px 6px; font-style: italic; }
.wt-id { display: flex; gap: 2px; align-items: center; width: 100%; }
.wt-id select { flex: 1; min-width: 0; }
.wt-id .btn { min-width: 22px; padding: 0 6px; }
.wt-prev { height: 120px; border-radius: var(--raio, 5px); background:
  repeating-conic-gradient(#2c2c2c 0 25%, #353535 0 50%) 0 0 / 16px 16px;
  display: flex; align-items: center; justify-content: center; color: var(--fraco, #8d8d8d); }
`;

  function css() {
    if (typeof document === 'undefined' || document.getElementById('wt-css')) return;
    const s = document.createElement('style'); s.id = 'wt-css'; s.textContent = CSS;
    document.head.append(s);
  }

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // template_list: {itens_lista:[{nome, icone?, indice}], ativo:{rna, valor}, rna, rows, total}
  function templateList(no, enviar) {
    css();
    const caixa = el('div', 'wt-lista');
    const linhas = Math.max(no.rows || 5, Math.min((no.itens_lista || []).length, 10));
    caixa.style.height = (linhas * 20 + 2) + 'px';
    const itens = no.itens_lista || [];
    if (!itens.length) caixa.append(el('div', 'wt-vazio', '(vazia)'));
    let ativo = no.ativo ? no.ativo.valor : -1;
    for (const it of itens) {
      const linha = el('div', 'wt-item' + (it.indice === ativo ? ' ativo' : ''));
      if (it.icone && it.icone !== 'NONE') linha.append(el('span', 'wt-ico', '●'));
      linha.append(el('span', null, it.nome ?? '#' + it.indice));
      linha.title = it.nome ?? '';
      linha.onclick = () => {
        if (!no.ativo || !no.ativo.rna) return;
        ativo = it.indice;
        caixa.querySelectorAll('.wt-item').forEach(x => x.classList.remove('ativo'));
        linha.classList.add('ativo');
        enviar({ cmd: 'escrever', rna: no.ativo.rna, valor: it.indice, indice: null });
      };
      caixa.append(linha);
    }
    if (no.total > itens.length) caixa.append(el('div', 'wt-vazio', '+' + (no.total - itens.length) + ' itens'));
    return caixa;
  }

  // template_ID: {rna, valor, opcoes, editavel, op_novo, op_abrir, op_desvincular}
  function templateID(no, enviar) {
    css();
    const r = el('div', 'wt-id');
    const s = el('select');
    s.add(new Option('(nenhum)', ''));
    for (const n of no.opcoes || []) {
      const o = new Option(n, n); if (n === no.valor) o.selected = true; s.add(o);
    }
    if (no.valor == null) s.value = '';
    s.disabled = !no.editavel || !no.rna;
    s.title = no.rotulo || '';
    s.onchange = () => enviar({ cmd: 'escrever', rna: no.rna, valor: s.value || null, indice: null });
    r.append(s);
    const botao = (op, txt, dica, cmd) => {
      if (!op) return;
      const b = el('button', 'btn', txt); b.title = dica + ' (' + op + ')';
      b.onclick = () => enviar(cmd ? cmd(op) : { cmd: 'operador', op, props: {} });
      r.append(b);
    };
    botao(no.op_novo, '+', 'Novo', op => ({ cmd: 'novo_bloco', op, rna: no.rna }));
    botao(no.op_abrir, '\u{1F4C2}', 'Abrir');
    botao(no.op_desvincular, '×', 'Desvincular');
    return r;
  }

  // template_preview: {id:{id_tipo, id}} — imagem virá depois.
  function templatePreview(no) {
    css();
    const d = el('div', 'wt-prev', no.id ? 'Prévia: ' + no.id.id : 'Sem prévia');
    if (no.id) d.dataset.preview = no.id.id_tipo + ':' + no.id.id;
    return d;
  }

  const POR_TIPO = { template_list: templateList, template_ID: templateID, template_preview: templatePreview };

  // Devolve o HTMLElement do nó, ou null se não for um template conhecido / veio sem_suporte.
  function criar(no, enviar) {
    const f = POR_TIPO[no && no.tipo];
    if (!f || no.sem_suporte) return null;
    return f(no, enviar);
  }

  global.WidgetsTemplates = { criar, templateList, templateID, templatePreview };
})(typeof window !== 'undefined' ? window : globalThis);
