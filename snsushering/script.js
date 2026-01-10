import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push, remove } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
    authDomain: "test-database-55379.firebaseapp.com",
    databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "test-database-55379",
    storageBucket: "test-database-55379.firebasestorage.app",
    messagingSenderId: "933688602756",
    appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
    measurementId: "G-1LSTC0N3NJ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Dynamic Date Logic
const today = new Date();
const dateKey = today.toISOString().split('T')[0]; // Format: 2026-01-10
const dateDisplay = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// App Constants
const DEPLOYMENT = [
    { id: 'greeters', title: '4 - Labas Entrance', slots: 4 },
    { id: 'meeters', title: '6 - Inside Entrance', slots: 6 },
    { id: 'hall', title: '2 - Main Door Hall', slots: 2 },
    { id: 'seaters', title: '3 - Main Hall Seaters', slots: 3 }
];
const COUNTERS = [
    {id:'exalt', name:'Exalt'}, {id:'speaker', name:'Speaker'},
    {id:'ushering', name:'Ushering'}, {id:'hall_adult', name:'Hall (Adults)'}, {id:'hall_kids', name:'Hall (Kids)'},
    {id:'tech', name:'Tech'}, {id:'toddlers', name:'Toddlers Area'},
    {id:'next_gen_adult', name:'Next Gen Adult'}, {id:'next_gen_kids', name:'Next Gen Kids'},
    {id:'admin', name:'Admin Office'}
];
const REMINDERS = [
    "Gather Volunteers after Heart Prep", "Pwesto na by 4:30pm", "Smile and greet with joy and enthusiasm",
    "Drink water para iwas ngalay", "During the message pwede na pumasok",
    "During response song, go back to main entrance para mag \"see you next week\""
];

let activeSlot = null;
let currentAssignments = {};
let allVolunteers = [];
let currentCounts = {};

function init() {
    // Set Dynamic Date
    document.getElementById('displayDate').innerText = dateDisplay;

    // 1. Setup Counters UI
    const cGrid = document.getElementById('counterGrid');
    cGrid.innerHTML = ''; 
    COUNTERS.forEach(c => {
        cGrid.innerHTML += `
        <div class="counter-item">
            <p class="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">${c.name}</p>
            <div class="flex justify-between items-center">
                <button onclick="updateCount('${c.id}', -1)" class="text-slate-300 active:scale-125 transition-transform"><span class="material-icons text-xl">remove_circle_outline</span></button>
                <span id="val_${c.id}" class="text-xl font-black text-slate-700">0</span>
                <button onclick="updateCount('${c.id}', 1)" class="text-blue-500 active:scale-125 transition-transform"><span class="material-icons text-xl">add_circle</span></button>
            </div>
        </div>`;
    });

    // 2. Setup Deployment UI
    const dSections = document.getElementById('deploymentSections');
    dSections.innerHTML = '';
    DEPLOYMENT.forEach(s => {
        let slotsHTML = '';
        for(let i=0; i<s.slots; i++) {
            slotsHTML += `
            <button onclick="openDrawer('${s.id}_${i}')" id="slot_${s.id}_${i}" 
                class="slot-btn w-full p-4 rounded-2xl flex justify-between items-center text-[13px] font-bold text-slate-300">
                <span>Empty Slot</span> <span class="material-icons text-lg">add</span>
            </button>`;
        }
        dSections.innerHTML += `
        <div class="slot-card">
            <h3 class="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-5 italic">${s.title}</h3>
            ${slotsHTML}
        </div>`;
    });

    // 3. Setup Reminders UI
    const rems = document.getElementById('remindersContainer');
    rems.innerHTML = '';
    REMINDERS.forEach((text, index) => {
        rems.innerHTML += `
        <label class="flex items-start gap-4 p-4 bg-slate-50/50 rounded-2xl cursor-pointer active:bg-blue-50 transition-colors">
            <input type="checkbox" id="check_${index}" onchange="saveCheck(${index}, this.checked)" class="mt-0.5 shrink-0">
            <span class="text-[12px] font-semibold text-slate-600 leading-snug">${text}</span>
        </label>`;
    });

    // 4. Input Auto-Add Listener
    document.getElementById('vInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addVolunteerFromInput();
        }
    });
    document.getElementById('addBtn').onclick = addVolunteerFromInput;

    // 5. Copy Summary Listener
    document.getElementById('copySummaryBtn').onclick = generateSummary;

    // 6. Sync Data
    sync();
}

function addVolunteerFromInput() {
    const input = document.getElementById('vInput');
    const val = input.value.trim();
    if(val) {
        push(ref(db, 'volunteers'), val);
        input.value = '';
    }
}

function sync() {
    onValue(ref(db, 'volunteers'), snap => {
        allVolunteers = Object.entries(snap.val() || {});
        const pool = document.getElementById('pool');
        pool.innerHTML = '';
        allVolunteers.forEach(([key, name]) => {
            pool.innerHTML += `
            <div class="vol-chip flex items-center gap-2">
                <span class="text-xs font-bold text-slate-600">${name}</span> 
                <button onclick="delVol('${key}')" class="text-[#ff5c5c] flex items-center"><span class="material-icons text-[18px]">cancel</span></button>
            </div>`;
        });
        document.getElementById('rosterCount').innerText = allVolunteers.length;
    });

    onValue(ref(db, `sessions/${dateKey}/assignments`), snap => {
        currentAssignments = snap.val() || {};
        DEPLOYMENT.forEach(s => {
            for(let i=0; i<s.slots; i++) {
                const id = `${s.id}_${i}`;
                const btn = document.getElementById(`slot_${id}`);
                const val = currentAssignments[id];
                if(val) {
                    btn.className = "slot-btn active w-full p-4 rounded-2xl flex justify-between items-center text-[13px] font-black";
                    btn.innerHTML = `<span>${val}</span> <span class="material-icons text-blue-500">check_circle</span>`;
                } else {
                    btn.className = "slot-btn w-full p-4 rounded-2xl flex justify-between items-center text-[13px] font-bold text-slate-300";
                    btn.innerHTML = `<span>Empty Slot</span> <span class="material-icons text-lg">add</span>`;
                }
            }
        });
    });

    onValue(ref(db, `sessions/${dateKey}/counters`), snap => {
        currentCounts = snap.val() || {};
        let total = 0;
        let adultSum = 0;
        let kidsSum = 0;

        COUNTERS.forEach(c => {
            const val = parseInt(currentCounts[c.id]) || 0;
            const el = document.getElementById(`val_${c.id}`);
            if(el) el.innerText = val;
            total += val;
            
            // Logic: kids are toddlers, next_gen_kids, and hall_kids.
            if(['toddlers', 'next_gen_kids', 'hall_kids'].includes(c.id)) {
                kidsSum += val;
            } else {
                adultSum += val;
            }
        });

        document.getElementById('grandTotal').innerText = total;
        document.getElementById('adultTotal').innerText = adultSum;
        document.getElementById('kidsTotal').innerText = kidsSum;
    });

    onValue(ref(db, `sessions/${dateKey}/checklist`), snap => {
        const data = snap.val() || {};
        REMINDERS.forEach((_, index) => {
            const cb = document.getElementById(`check_${index}`);
            if (cb) cb.checked = data[index] || false;
        });
    });
}

function generateSummary() {
    let summary = `📍 USHERING SUMMARY - ${dateDisplay}\n\n`;
    
    summary += `--- ATTENDANCE ---\n`;
    let total = 0;
    let adultSum = 0;
    let kidsSum = 0;

    COUNTERS.forEach(c => {
        const val = currentCounts[c.id] || 0;
        summary += `${c.name}: ${val}\n`;
        total += val;
        if(['toddlers', 'next_gen_kids', 'hall_kids'].includes(c.id)) kidsSum += val;
        else adultSum += val;
    });
    
    summary += `\nTOTAL ADULTS: ${adultSum}\n`;
    summary += `TOTAL KIDS: ${kidsSum}\n`;
    summary += `GRAND TOTAL: ${total}\n\n`;

    summary += `--- POSITIONING ---\n`;
    DEPLOYMENT.forEach(s => {
        summary += `[${s.title}]\n`;
        for(let i=0; i<s.slots; i++) {
            const val = currentAssignments[`${s.id}_${i}`] || '---';
            summary += `${i+1}. ${val}\n`;
        }
        summary += `\n`;
    });

    navigator.clipboard.writeText(summary).then(() => {
        const toast = document.getElementById('toast');
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 2000);
    });
}

// Global Window Functions
window.openDrawer = (id) => {
    activeSlot = id;
    const drawer = document.getElementById('assignDrawer');
    const list = document.getElementById('selectionList');
    const used = Object.values(currentAssignments);
    
    list.innerHTML = '';
    allVolunteers.forEach(([k, name]) => {
        if(!used.includes(name)) {
            list.innerHTML += `
            <button onclick="assign('${name}')" class="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[13px] font-bold text-slate-700 active:bg-blue-600 active:text-white transition-colors">
                ${name}
            </button>`;
        }
    });
    drawer.classList.remove('hidden');
};

window.assign = (name) => {
    set(ref(db, `sessions/${dateKey}/assignments/${activeSlot}`), name);
    closeDrawer();
};

window.clearSlot = () => {
    remove(ref(db, `sessions/${dateKey}/assignments/${activeSlot}`));
    closeDrawer();
};

window.saveCheck = (index, checked) => {
    set(ref(db, `sessions/${dateKey}/checklist/${index}`), checked);
};

window.closeDrawer = () => document.getElementById('assignDrawer').classList.add('hidden');

window.updateCount = (id, amt) => {
    const val = parseInt(document.getElementById(`val_${id}`).innerText) || 0;
    set(ref(db, `sessions/${dateKey}/counters/${id}`), Math.max(0, val + amt));
};

window.delVol = (key) => remove(ref(db, `volunteers/${key}`));

init();