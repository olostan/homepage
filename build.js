const less = require('less');
const fs = require('fs');

function buildCss() {
    less.render(fs.readFileSync('public/clear.less').toString(),
        {plugins: [new (require('less-plugin-clean-css'))({advanced: true})] })
    .then(function(output) {
        fs.writeFileSync('public/clear.css',output.css);
        console.log("CSS Built");
        // output.css = string of css
        // output.map = string of sourcemap
        // output.imports = array of string filenames of the imports referenced
    },
    function(error) {
        console.error('Error during less build:',error);
    });
}

const execFile = require('child_process').execFile;
const CHROME = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
 
function buildPDF(debug) {
    return new Promise((resolve, reject) => {
        let url = debug?'http://localhost:5000':'https://olostan.name/';
        execFile(CHROME, ['--headless', '--disable-gpu', '--print-to-pdf=public/Valentyn\ Shybanov\ Personal\ profile.pdf', url],function(err){
            console.log("PDF built");
            return true;
        });
    });
}

if (process.argv[2]!='watch') {
    buildCss();
    buildPDF(process.argv[2]=='local');
} else {
    console.log("watching...");
    buildCss();
    buildPDF(true);
    fs.watch('public/clear.less',{},function (eventType, filename)  {
        if (eventType=='change') {
            console.log("Css changed");
            buildCss();
        }
    });
    let pdfTimer = null;
    fs.watch('public/index.html',{},function (eventType, filename)  {        
        if (eventType=='change') {
            if (pdfTimer!=null) return;
            pdfTimer = setTimeout(() => {
                console.log("PDF changed");
                buildPDF(true).then(() => pdfTimer = false);
            });
        }
    });

}