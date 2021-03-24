const less = require('less');
const fs = require('fs');
const puppeteer = require('puppeteer');

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

async function buildPDF(debug) {
    const browser = await puppeteer.launch({ headless: true });
    //const CHROME = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
    const page = await browser.newPage();

    await page.goto(debug?'http://localhost:5000':'https://olostan.name/', {waitUntil: 'networkidle0'});
    await page.pdf({ path: 'public/Valentyn\ Shybanov\ Personal\ profile.pdf',
         margin: { top: "40", right: "40", bottom: "40", left: "40" },
         displayHeaderFooter: true, 
         format: 'A4' });
    await browser.close();
    console.log("PDF created");
}

if (process.argv[2]!='watch') {
    buildCss();
    buildPDF(process.argv[2]=='local');
} else {
    console.log("watching...");
    buildCss();
    buildPDF(true);
    let pdfTimer = null;
    function rebuildPDF() {
        if (pdfTimer!=null) return;
        pdfTimer = setTimeout(() => {
            buildPDF(true).then(() => pdfTimer = false).catch((err) => console.error(err));
        });
    }
    fs.watch('public/clear.less',{},function (eventType, filename)  {
        if (eventType=='change') {
            console.log("Css changed");
            buildCss();
            buildPDF(true);
        }
    });
   
    fs.watch('public/index.html',{},function (eventType, filename)  {        
        if (eventType=='change') {
            console.log("HTML changed");
            buildPDF(true);
        }
    });

}