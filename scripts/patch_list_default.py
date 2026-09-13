from pathlib import Path

p = Path('index.html')
s = p.read_text()

old_sub = '<p class="sub">Type what you need, paste a list, or update a shelf price with a photo.</p>'
new_sub = '<p class="sub">Paste or type your shopping list, one item per line, or update a shelf price with a photo.</p>'
if old_sub in s:
    s = s.replace(old_sub, new_sub, 1)

old_block = '''    <div class="card stack">
      <div class="add-row">
        <input class="text-input" id="singleItem" placeholder="Add an item…" />
        <button class="add-btn" id="addItemBtn" aria-label="Add item">+</button>
      </div>
      <button class="paste-btn" id="pasteToggle">Paste multiple items</button>
      <div id="pasteBox" class="hidden stack">
        <textarea class="textarea" id="pasteInput" placeholder="Carrots&#10;Lemons&#10;Mayonnaise&#10;Baby wipes"></textarea>
        <button class="secondary full" id="pasteAddBtn">Add pasted items</button>
      </div>
    </div>'''

new_block = '''    <div class="card stack">
      <div id="pasteBox" class="stack">
        <textarea class="textarea" id="pasteInput" placeholder="Carrots&#10;Lemons&#10;Mayonnaise&#10;Baby wipes"></textarea>
        <button class="secondary full" id="pasteAddBtn">Add items</button>
      </div>
      <button class="paste-btn" id="pasteToggle">+ Add single item</button>
      <div class="add-row hidden" id="singleItemBox">
        <input class="text-input" id="singleItem" placeholder="Add one item…" />
        <button class="add-btn" id="addItemBtn" aria-label="Add item">+</button>
      </div>
    </div>'''

if old_block in s:
    s = s.replace(old_block, new_block, 1)
elif 'id="singleItemBox"' not in s:
    raise SystemExit('List entry layout anchor not found')

old_toggle = "$('#pasteToggle').onclick=()=>$('#pasteBox').classList.toggle('hidden');"
new_toggle = "$('#pasteToggle').onclick=()=>{const box=$('#singleItemBox');box.classList.toggle('hidden');const open=!box.classList.contains('hidden');$('#pasteToggle').textContent=open?'Hide single item':'+ Add single item';if(open)$('#singleItem').focus()};"
if old_toggle in s:
    s = s.replace(old_toggle, new_toggle, 1)
elif "$('#singleItemBox')" not in s:
    raise SystemExit('List toggle handler anchor not found')

p.write_text(s)
