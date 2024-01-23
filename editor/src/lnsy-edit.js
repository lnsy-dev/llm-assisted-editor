import './vendor/codemirror.js';
import './vendor/javascript.js';
import './vendor/css.js';
import './vendor/xml.js'
import './vendor/htmlmixed.js'
import './vendor/markdown.js'
import './vendor/closetag.js'

function parseJSONFrontmatter(markdownContent) {
  // Regular expression to match YAML or JSON frontmatter
  const frontmatterRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]+/;

  // Check if frontmatter exists in the markdown content
  const match = markdownContent.match(frontmatterRegex);

  if(match === null){
    return {}
  }

  if (match && match[1]) {
    // Extract the frontmatter string
    const frontmatterString = match[1];

    try {
      // Parse the frontmatter string into a JavaScript object
      const frontmatterObject = JSON.parse(frontmatterString);

      return frontmatterObject;
    } catch (error) {
      console.error('Error parsing frontmatter:', error);
      return {};
    }
  }

  // If no frontmatter is found, return null
  return null;
}

// Function to remove YAML front matter from a string
function removeFrontMatter(content) {
    const yamlRegex = /^---\n([\s\S]*?)\n---/;
    return content.replace(yamlRegex, '').trim();
}

class LNSYEdit extends HTMLElement {
  connectedCallback(){
    const details = document.createElement('details');
    details.innerHTML = `<summary><b>LLM Assisted Editor</b></summary>`; 
    details.setAttribute('open', true);
    details.classList.add('no-select');

    const button_bar = document.createElement('button-bar');
    const save_button = document.createElement('button');
    save_button.innerText = 'query llm';
    save_button.addEventListener('click', (e) => {
      this.saveData();
    });
    save_button.setAttribute('name', 'Ctrl-S');

    button_bar.appendChild(save_button);
    
    this.download_button = document.createElement('button');
    this.download_button.setAttribute('disabled', 'true');
    this.download_button.innerText = 'download markdown'
    this.download_link = document.createElement('a');
    this.download_link.setAttribute('download', true);
    this.download_button.addEventListener('click', (e) => {
      this.download_link.click();
    });
    button_bar.appendChild(this.download_link);
    button_bar.appendChild(this.download_button);

    const load_file_container = document.createElement('button');
    load_file_container.innerText = 'load from disk'

    const load_file = document.createElement('input');
    load_file.setAttribute('type', 'file');
    load_file.setAttribute('accept', '.md, .txt');
    load_file.addEventListener('change', (e) => {
     const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.loadMarkdown(e.target.result);
        };
        reader.readAsText(file);
      }
    });
    load_file_container.addEventListener('click', (e) => {
      load_file.click();
    });
    load_file_container.appendChild(load_file)
    button_bar.appendChild(load_file_container);

    const token_label = document.createElement('label');
    token_label.setAttribute('id', 'tokens-label');
    token_label.innerText = 'Tokens:'
    const tokens = document.createElement('input');
    tokens.setAttribute('id', 'token_adjust');
    tokens.value = 100; 
    token_label.appendChild(tokens);
    button_bar.appendChild(token_label);


    details.appendChild(button_bar);

    this.json_editor = document.createElement('json-editor');
    details.appendChild(this.json_editor);
    this.appendChild(details);

    this.textarea = document.createElement('textarea')
    this.appendChild(this.textarea)
    this.editor = CodeMirror.fromTextArea(this.textarea, {
      lineNumbers:false,
      mode:'markdown',
      theme:'lnsy-edit',
      autoCloseTags:true,
      lineWrapping: true,
      fencedCodeBlockHighlighting: true
    });

    this.editor.setOption("extraKeys", {
      Tab: function(cm) {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      },
      'Ctrl-P': () => {        
        this.dispatchEvent(new CustomEvent('control-panel',{
          detail:{
            cursor: this.editor.getCursor()
          }
        }))
        return true
      },
      'Ctrl-S': () => {
        this.saveData();
        return true
      } 
    });


    let metadata = this.getAttribute('metadata');
    if(metadata === null){
      metadata = {}
    } else {
      metadata = JSON.parse(metadata);
    }

    let content = this.getAttribute('content');
    if(content === null){
      content = ''
    } 

    this.file_id = localStorage.getItem('last-file');
    if(this.file_id !== null){
      this.loadLocalData(this.file_id);
    } else {
      this.file_id = crypto.randomUUID() + '.md';
      this.setAttribute('file-id', this.file_id);
    }

    this.editor.on("change", () => {
      this.saveLocalData();
    });

    this.json_editor.addEventListener('json-updated', (e)=>{
      this.saveLocalData();
    })
  }

  loadLocalData(file_id){
    const markdown = localStorage.getItem(file_id);
    this.loadMarkdown(markdown);
  }

  saveLocalData(){
    const json_data = this.json_editor.getData();
    const file_id = json_data["file-id"];
    localStorage.setItem('last-file', file_id);
    const markdown_content = this.getMarkdown();
    localStorage.setItem(file_id, markdown_content);

  }

  saveData(){
    this.json_editor.upsertData({
      "last-updated": new Date().toISOString()
    });

    const json_data = this.json_editor.getData();
    const editor_content = this.editor.getValue();
    const markdown_content = this.getMarkdown();
    const save_event = new CustomEvent('save', {
      detail: {
        metadata: json_data,
        content: editor_content,
        markdown: markdown_content,
        timestamp: new Date().toISOString()
      }
    });

    this.saveLocalData();
    this.dispatchEvent(save_event);
    const blob = new Blob([markdown_content], { type: 'text/plain' });
    const dataUrl = URL.createObjectURL(blob);

    this.download_link.href = dataUrl;
    this.download_button.removeAttribute('disabled');
    let file_name =  json_data["file-id"];
    this.download_link.download = `${file_name}`;
  }

  loadData(content, metadata){
    if(metadata["file-id"]){
      this.setAttribute('file-id', metadata["file-id"]);
    } else {
      metadata["file-id"] = this.getAttribute('file-id');
    }

    if(metadata["file-created"]){
      this.setAttribute('file-created', metadata["file-created"])
    } else {
      metadata["file-created"] = new Date().toISOString();
    }
    this.json_editor.updateData(metadata);
    this.editor.setValue(content);
  }

  loadMarkdown(markdown){
    const metadata = parseJSONFrontmatter(markdown);
    if(metadata["file-id"]){
      this.setAttribute('file-id', metadata["file-id"]);
    } else {
      metadata["file-id"] = this.getAttribute('file-id');
    }

    Object.keys(metadata).forEach(key => {
      this.setAttribute(key, metadata[key]);
    });

    const content = removeFrontMatter(markdown);
    this.json_editor.updateData(metadata);
    this.editor.setValue(content);
  }

  appendText(text){
    const totalLines = this.editor.lineCount();
    const lastLine = this.editor.getLine(totalLines - 1);
    // Compute the position where the new text will be inserted
    const position = { line: totalLines - 1, ch: lastLine.length };
    // Append the text at the position
    this.editor.replaceRange(text, position);
  }

  getText(){
    return this.editor.getValue();
  }
  getMarkdown(){
    const json_data = this.json_editor.getData();
    const editor_content = this.editor.getValue();
return `---
${JSON.stringify(json_data)}
---
${editor_content}
`
  }
}

customElements.define('lnsy-edit', LNSYEdit)

