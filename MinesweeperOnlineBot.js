
import { JSDOM } from "jsdom";
import { By, Builder, Capabilities, Key, until } from 'selenium-webdriver';

import { dropHandler, doAnalysis, startup } from "./Minesweeper/client/main.js";

import { CURRENT_PLAYSTYLE } from "./Minesweeper/client/global.js";
import { _DBG_clearHistory } from "readline-sync";

import { appendFile } from 'fs';

let globalGameLost = false;
let currentURL;

const PLAY_STYLE_FLAGS = 1;
const PLAY_STYLE_NOFLAGS = 2;
const PLAY_STYLE_EFFICIENCY = 3;
const PLAY_STYLE_NOFLAGS_EFFICIENCY = 4;

// * For reference
// const ACTION_CLEAR = 1; 
// const ACTION_FLAG = 2;
// const ACTION_CHORD = 3;

const chromeOptions = new Capabilities();
chromeOptions.set('browserName', 'chrome');
chromeOptions.set('unexpectedAlertBehaviour', 'ignore');
chromeOptions.set('goog:chromeOptions', {
    args: [
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
        '--disable-blink-features=AutomationControlled'
    ]
});

const driver = new Builder().forBrowser('chrome').withCapabilities(chromeOptions).build();
await driver.manage().setTimeouts({ implicit: 10000, pageLoad: 15000 });

//todo: remove this
let firstClick = true;

await main();

async function getHTML() {
    await driver.get("https://minesweeperonline.com/"); // Load up the browser
    let gameElement = await driver.findElement(By.id('game-container'));
    
    // Might be unnecessary but leave it 
    await gameElement.isDisplayed();
    await new Promise(r => setTimeout(r, 500)); // Wait 0.5 seconds for the game element to be updated to the expert board (idk why but this makes it more consistent)
    
    return await gameElement.getAttribute('innerHTML');
}

function parseHTML(gameHTML) {
    const document = new JSDOM(gameHTML).window.document; // parse the input into a new "document"
    
    let data = "";
    let totalMines;

    // 24 columns x 20 rows
    // * For now, only expert games
    totalMines = 99;

    const allCellsHTML = document.getElementById("game")

    let width; // First number
    let height; // Second number

    let tileStatus;

    let currentWidth = 0;

    let newWidth;
    let newHeight;

    let classArray;
    
    // console.log("document: ", document)
    // console.log("document.children:", document.children);
    for (const cell of allCellsHTML.children) {
        classArray = cell.className.split(" ");
        if (classArray[0] !== "square" || cell.style.display === "none") {
            continue;
        }

        
        // square open[0-8]
        // square blank
        // square bombflagged
        // square bombdeath
        // square bombrevealed
        
        // Check for closed cell first
        
        if (classArray[1] === "blank") {
            tileStatus = "closed";
        } else if (classArray[1] === "bombflagged") {
            tileStatus = "flag";
        } else if (classArray[1].slice(0, -1) === "open") {
            tileStatus = classArray[1].slice(-1);
        } else {
            globalGameLost = true;
            return null;
        }

        // Update currentWidth and currentHeight
        [newHeight, newWidth] = cell.id.split("_").map(e => parseInt(e));

        if (newWidth === 1 && newHeight !== 1) {
            data += "\n";
            if (!width) {
                // Need the previous width since the new width is 0
                width = currentWidth; // width is 1 indexed, currentWidth is 1 indexed
            }
        }
        currentWidth = newWidth;

        switch (tileStatus) {
            case "flag": {
                // totalMines++;
                data += "F";
                break;
            }
            case "closed": {
                data += "H";
                break;
            }
            default: {
                data += tileStatus;
            }
        }
    }
        
    height = newHeight; // Height is 1 indexed, newHeight is 1 indexed

    data = `${width}x${height}x${totalMines}\n` + data;
    
    console.log(data.split("\n"));
    
    return data;
}




async function main() {
    let gameHTML, data, gameElement;
    
    gameHTML = await getHTML();
    
    gameHTML = `<div>${gameHTML}</div>`
    
    console.log("gameHTML is: ", gameHTML);
    
    data = parseHTML(gameHTML);
    
    await startup();
        
    const cornerIDs = [[0, 0], [29, 0], [0, 15], [29, 15]];
    
    let cell;
    let actions;
    let duration;
    let click;
    
    while (true) {
        // if (CURRENT_PLAYSTYLE === PLAY_STYLE_EFFICIENCY) {
        //     actions = driver.actions();
        //     for (const [x, y] of cornerIDs) {
        //         cell = `cell_${x}_${y}`;
        //         click = await driver.findElement(By.id(`${cell}`));
        //         duration = Math.floor(Math.random() * 200 + 800);
        //         await actions.move({origin: click, duration}).click(); // TODO: Click all corners regardless of death lol
        //         await actions.perform();
        //         await actions.clear();
        //         await new Promise(r => setTimeout(r, 500));
        //         gameHTML = await getHTML(currentURL);
        //         data = parseHTML(gameHTML);
        //         if (checkAllOpenings(data)) {
        //             break;
        //         }
        //     }
        // }
        // await new Promise(r => setTimeout(r, 500)); // Wait for server response after click
        gameHTML = await getHTML(currentURL);
        data = parseHTML(gameHTML);
        // if (CURRENT_PLAYSTYLE === PLAY_STYLE_EFFICIENCY) {
        //     data === null ? globalGameLost = true : (checkAllOpenings(data) ? globalGameLost = false : globalGameLost = true);
        // }
        while (!globalGameLost) {
            await dropHandler(data);
            await doAnalysis();
            
            // counter++;
            // if (counter === 2) {
            //     break;
            // }
            
            gameElement = await driver.findElement(By.id('game-container'));
            
            gameHTML = await gameElement.getAttribute('innerHTML');
            data = parseHTML(gameHTML);
            if (data === null) {
                break;
            }
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait for server response after click
        // driver.wait(until.alertIsPresent()).then(()=> { driver.switchTo().alert().accept(); });
        console.log("death detected! resetting");
        firstClick = true;

        await driver.actions().sendKeys(Key.SPACE).perform(); // Reset the board
        
        globalGameLost = false;    
    }
}

function checkAllOpenings(data) {
    if (data === null) {
        return true; // Early return to exit all 4 corners loop
    }
    console.log("number of H's: ", data?.split("H").length - 1);
    if ((data?.split("H").length - 1) <= 480 - 45) {
        return true;
    }
    const arrayForm = data?.split("\n");
    if (arrayForm[1][0] !== '0' || arrayForm[1][29] !== '0' || arrayForm[16][0] !== '0' || arrayForm[16][29] !== '0') {
        return false;
    }
    return true;
}

export function gameWon() {
    globalGameLost = true;
}

export async function nextActions(result) {
    // console.log("I got here and result is: ", result);
    if (firstClick) {
        let actions = driver.actions();
        let click = await driver.findElement(By.id(`8_15`));
        await actions.move({origin: click}).click();
        await actions.perform();
        await actions.clear();
        firstClick = false;
        return;
    }
    
    let cell;
    let x, y;
    
    if (result.length === 0) {
        return;
    }
    
    if (CURRENT_PLAYSTYLE === PLAY_STYLE_EFFICIENCY) {
        let actions = driver.actions();
        if (result[0].action === undefined) {
            ({x, y} = result[0].action); // JS destructuring syntax
            let click = await driver.findElement(By.id(`${y + 1}_${x + 1}`));
            await actions.move({origin: click}).click();
        }
        else if (result[0].action === 2 || result[0].action === 3) {
            console.log("I GOT HERE")
            for (const action of result) {
                ({x, y} = action); // JS destructuring syntax
                cell = `${y + 1}_${x + 1}`;
                let click = await driver.findElement(By.id(`${cell}`));
                if (action.action === 2) {
                    await actions.move({origin: click}).contextClick();
                } else if (action.action === 3) {
                    console.log("CHORDING")
                    await actions.move({origin: click}).click();
                }
            }
        } else {
            if (result[0].action === 1) {
                ({x, y} = result[0]); // JS destructuring syntax
                cell = `${y + 1}_${x + 1}`;
                let click = await driver.findElement(By.id(`${cell}`));
                await actions.move({origin: click}).click();
            }
        }
        await actions.perform();
        await actions.clear();
        // await new Promise(r => setTimeout(r, 500)); // Wait for server response after click
        // TODO: ^ Do this for normal play too
        return;
    }
    
    let cellsToClick = [];
    let cellstoFlag = [];

    if (Array.isArray(result)) {
        if (result[0].prob === 1 || result[0].prob === 0) { // Click a bunch of cells maybe
            let actions = driver.actions();
            for (const action of result) {
                ({x, y} = action); // JS destructuring syntax
                cell = `${y + 1}_${x + 1}`; //* 1 indexed!!
                if (action.prob === 1) {
                    cellsToClick.push(`${cell}`);
                } else if (action.prob === 0) {
                    cellstoFlag.push(`${cell}`);
                }
            }
            for (const cell of cellsToClick) {
                let click = await driver.findElement(By.id(`${cell}`));
                console.log("About to click on cell 1: ", `${cell}`);
                await actions.move({origin: click}).click(); // 1000 ms = 1 second
            }
            await actions.perform();
            try {
                const alert = await driver.switchTo().alert();
                if (alert) {
                    const alertText = await alert.getText();
                    appendFile('output.txt', alertText + "\n", (err) => {
                        if (err) {
                            throw err;
                        } else {
                            console.log("file written 2");
                        }
                    });
                    
                    await alert.dismiss(); // Example: Dismiss the alert
                }
            } catch (error) {
            }
            await actions.clear();
        } else { // Just click 1 cell
            try {
                const alert = await driver.switchTo().alert();
                if (alert) {
                    const alertText = await alert.getText();
                    appendFile('output.txt', alertText + "\n", (err) => {
                        if (err) {
                            throw err;
                        } else {
                            console.log("file written")
                        }
                    });
                    
                    await alert.dismiss(); // Example: Dismiss the alert
                }
            } catch (error) {
            }
            ({x, y} = result[0]); // JS destructuring syntax
            let click = await driver.findElement(By.id(`${y + 1}_${x + 1}`));
            console.log("About to click on cell 2: ", `cell_${y + 1}_${x + 1}`);
            const actions = driver.actions();
            await actions.move({origin: click}).click().perform(); // 1000 ms = 1 second
            try {
                const alert = await driver.switchTo().alert();
                if (alert) {
                    const alertText = await alert.getText();
                    appendFile('output.txt', alertText + "\n", (err) => {
                        if (err) {
                            throw err;
                        } else {
                            console.log("file written")
                        }
                    });
                    
                    await alert.dismiss(); // Example: Dismiss the alert
                }
            } catch (error) {
            }
            await actions.clear();
        }
        
    } else { // Only 1 move in the results array
        [x, y] = result.split(",");
        let click = await driver.findElement(By.id(`${y + 1}_${x + 1}`));
        const actions = driver.actions();
        console.log("About to click on cell 3: ", `cell_${y + 1}_${x + 1}`);
        await actions.move({origin: click}).click().perform(); // 1000 ms = 1 second
        await actions.clear();
    }
    // probability 1 = free
    // probability 0 = mine
}