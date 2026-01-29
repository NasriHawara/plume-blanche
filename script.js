// ==========================================
// SALON MANAGEMENT SYSTEM - FIXED VERSION
// ==========================================

const APP_SETTINGS = {
    openingTime: 10,
    closingTime: 19,
    slotInterval: 15
};

let technicians = [];
let services = [];
let mockAppointments = [];
let laserDates = [];
let currentUser = JSON.parse(localStorage.getItem('plume_user')) || null;
let isLoggingIn = true;
let weeklyViewOffset = 0;
let currentClientFilter = 'upcoming';
let currentEditingStaff = null;
let adminBookingContext = null;

const datePicker = document.getElementById('date-picker');
const detailsForm = document.getElementById('details-form');
const timeGrid = document.getElementById('time-slots');
const confirmModal = document.getElementById('confirm-modal');
const authBtn = document.getElementById('auth-action-btn');
const serviceCheckboxList = document.getElementById('service-checkbox-list');
const techSelect = document.getElementById('tech-select');
const bookingSummary = document.getElementById('booking-summary');
const bookNowBtn = document.getElementById('book-now-btn');

// ==========================================
// FIREBASE DATA SYNC
// ==========================================
function startFirebaseSync() {
    // Sync appointments
    const appointmentsRef = window.dbRef(window.db, 'appointments');
    window.dbOnValue(appointmentsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            mockAppointments = Object.keys(data).map(key => ({
                ...data[key],
                firebaseId: key
            }));
        } else {
            mockAppointments = [];
        }
        refreshCurrentView();
    });

    // Sync technicians
    const techRef = window.dbRef(window.db, 'technicians');
    window.dbOnValue(techRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            technicians = Object.keys(data).map(key => ({
                ...data[key],
                id: key
            }));

            if (currentUser && currentUser.role === 'specialist') {
                technicians = technicians.filter(tech =>
                    tech.userId === currentUser.uid
                );
            }
        } else {
            technicians = [];
        }
        updateClientDropdowns();
        if (currentUser) {
            if (currentUser.role === 'admin') {
                updateAdminFilterDropdowns();
                renderStaffList();
                if (!document.getElementById('admin-section').classList.contains('hidden')) {
                    renderAdminScheduler();
                }
            } else if (currentUser.role === 'specialist') {
                updateClientDropdowns();
                if (!document.getElementById('specialist-section').classList.contains('hidden')) {
                    renderSpecialistSchedule();
                }
            }
        }
    });

    // Sync services
    const servicesRef = window.dbRef(window.db, 'services');
    window.dbOnValue(servicesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            services = Object.keys(data).map(key => ({
                ...data[key],
                id: key
            }));
        } else {
            services = [];
        }
        renderServiceCheckboxes();
        if (currentUser && currentUser.role === 'admin') {
            updateAdminFilterDropdowns();
            renderServiceList();
            updateCategoryDropdown(); // FIX: Update category dropdown when services change
        }
    });

    // Sync laser dates
    const laserRef = window.dbRef(window.db, 'laserDates');
    window.dbOnValue(laserRef, (snapshot) => {
        const data = snapshot.val();
        laserDates = data ? Object.values(data) : [];
        if (currentUser && currentUser.role === 'admin') {
            updateLaserButton();
        }
    });

    // Sync notifications
    const notificationsRef = window.dbRef(window.db, 'notifications');
    window.dbOnValue(notificationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const notifications = Object.keys(data).map(key => ({
                ...data[key],
                key: key
            }));

            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
                checkForNewNotifications(notifications);
            }
        }
    });

    if (currentUser && currentUser.role === 'admin') {
        const usersRef = window.dbRef(window.db, 'users');
        window.dbOnValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                window.allUsers = Object.keys(data).map(key => ({
                    ...data[key],
                    uid: key
                }));
                console.log("Users data loaded for admin:", window.allUsers.length, "users");
            }
        });
    }
}

function refreshCurrentView() {
    if (!currentUser) return;

    if (currentUser.role === 'admin') {
        if (!document.getElementById('admin-section').classList.contains('hidden')) {
            refreshAdminData();
        }
    } else if (currentUser.role === 'specialist') {
        if (!document.getElementById('specialist-section').classList.contains('hidden')) {
            renderSpecialistSchedule();
        }
    } else {
        if (!document.getElementById('client-profile-section').classList.contains('hidden')) {
            renderClientProfile();
        }
    }
}

// ==========================================
// PHONE NUMBER SYNC LOGIC (FIXED)
// ==========================================
async function syncPhoneLinkedAppointments(userId, phone) {
    if (!phone) return;

    const appointmentsRef = window.dbRef(window.db, 'appointments');
    const snapshot = await window.dbGet(appointmentsRef);

    if (!snapshot.exists()) return;

    const appointments = snapshot.val();
    let syncCount = 0;

    for (const [key, appt] of Object.entries(appointments)) {
        // FIX: Match by phone number and sync to user account
        if (appt.phone === phone && (!appt.userId || appt.userId === 'ADMIN_MANUAL')) {
            const apptRef = window.dbRef(window.db, `appointments/${key}`);
            await window.dbUpdate(apptRef, {
                userId: userId,
                name: currentUser?.name || appt.name,
                email: currentUser?.email || appt.email
            });
            syncCount++;
        }
    }

    if (syncCount > 0) {
        console.log(`Synced ${syncCount} appointments to user account`);
        showNotification(`${syncCount} previous appointments linked to your account!`, 'success');
    }
}

// ==========================================
// NAVIGATION & AUTHENTICATION
// ==========================================
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.style.animation = 'fadeOut 0.3s ease';
    });

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.style.animation = 'fadeInUp 0.5s ease';
    }

    const navButtons = document.querySelectorAll('.btn-nav');
    navButtons.forEach(btn => {
        const btnText = btn.textContent.toLowerCase();
        if (currentUser) {
            if (currentUser.role === 'specialist') {
                if (btnText.includes('booking')) {
                    btn.classList.add('hidden');
                } else if (btnText.includes('profile')) {
                    btn.onclick = () => showView('specialist-section');
                    btn.querySelector('span').textContent = 'My Schedule';
                    btn.querySelector('i').className = 'fas fa-calendar-week';
                }
            } else if (currentUser.role === 'admin') {
                if (!btnText.includes('logout')) {
                    btn.classList.add('hidden');
                }
            }
        }
    });

    if (viewId === 'admin-section') refreshAdminData();
    if (viewId === 'client-profile-section') renderClientProfile();
    if (viewId === 'booking-section') renderServiceCheckboxes();
    if (viewId === 'specialist-section') renderSpecialistSchedule();
}

if (document.getElementById('toggle-text')) {
    document.getElementById('toggle-text').onclick = () => {
        isLoggingIn = !isLoggingIn;
        document.getElementById('signup-extra').classList.toggle('hidden', isLoggingIn);
        authBtn.innerHTML = isLoggingIn
            ? '<span>Login</span><i class="fas fa-arrow-right"></i>'
            : '<span>Create Account</span><i class="fas fa-user-plus"></i>';
        document.getElementById('auth-title').innerText = isLoggingIn ? 'Welcome Back' : 'Join Us';
    };
}

authBtn.onclick = async () => {
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const name = document.getElementById('fullname')?.value?.trim() || "";
    const phone = document.getElementById('phone')?.value?.trim() || "";

    if (!email || !password) {
        showNotification('Please fill in email and password', 'warning');
        return;
    }

    if (!isLoggingIn && (!name || !phone)) {
        showNotification('Please enter your name and phone number for signup', 'warning');
        return;
    }

    try {
        if (isLoggingIn) {
            const userCredential = await window.signInWithEmailAndPassword(window.auth, email, password);
            console.log("User logged in:", userCredential.user.uid);
            showNotification('Login successful!', 'success');

        } else {
            const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
            console.log("User created:", userCredential.user.uid);

            const userData = {
                email: email,
                name: name,
                phone: phone,
                role: 'client',
                createdAt: new Date().toISOString()
            };

            const userRef = window.dbRef(window.db, `users/${userCredential.user.uid}`);
            await window.dbSet(userRef, userData);
            console.log("Client account created");

            // FIX: Sync phone-linked appointments immediately after signup
            await syncPhoneLinkedAppointments(userCredential.user.uid, phone);

            showNotification('Account created successfully!', 'success');
        }

    } catch (error) {
        console.error("Auth error:", error);
        let message = 'Authentication failed. ';
        if (error.code === 'auth/email-already-in-use') {
            message = 'Email already in use. Please login instead.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password should be at least 6 characters.';
        } else if (error.code === 'auth/user-not-found') {
            message = 'Account not found. Please sign up first.';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Incorrect password.';
        }
        showNotification(message, 'danger');
    }
};

document.getElementById('logoutBtn').onclick = async () => {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await window.signOut(window.auth);
            showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error("Logout error:", error);
            showNotification('Logout failed', 'danger');
        }
    }
};

// ==========================================
// BOOKING ENGINE
// ==========================================
function renderServiceCheckboxes() {
    const container = document.getElementById('service-checkbox-list');
    if (!container) return;

    container.innerHTML = '';

    const selectedDate = datePicker?.value;
    const isLaserEnabled = selectedDate && laserDates.includes(selectedDate);

    const categories = {};
    services.forEach(service => {
                const isLaserService = service.category && (
            service.category.toLowerCase().includes('laser') || 
            service.category.toLowerCase() === 'laser men' || 
            service.category.toLowerCase() === 'laser women'
        );

        // FIX: Hide laser services if not enabled for the date (unless admin)
        if (isLaserService && !isLaserEnabled && currentUser && currentUser.role !== 'admin') {
            return;
        }

        let catName = service.category || "General Services";
        if (isLaserService) {
           catName = service.category; 
        }

        if (!categories[catName]) categories[catName] = [];
        categories[catName].push(service);
    });

    if (Object.keys(categories).length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>No services available for the selected date.</p>
                ${selectedDate && !isLaserEnabled ?
                    '<p style="font-size: 0.9rem;">Laser services are not available on this date.</p>' : ''}
            </div>
        `;
        return;
    }

    Object.keys(categories).forEach(catName => {
        const catBtn = document.createElement('button');
        catBtn.className = 'category-toggle-btn';

        if (catName === "Laser") {
            catBtn.innerHTML = `<span><i class="fas fa-bolt"></i> ${catName}</span>`;
            catBtn.style.borderLeft = '3px solid #ff9800';
        } else {
            catBtn.innerHTML = `<span>${catName}</span>`;
        }

        const tray = document.createElement('div');
        tray.className = 'service-tray hidden';

        catBtn.onclick = (e) => {
            e.preventDefault();
            const isActive = catBtn.classList.toggle('active');
            tray.classList.toggle('hidden', !isActive);
        };

        categories[catName].forEach(service => {
            const item = document.createElement('div');
            item.className = 'checkbox-item';

            const serviceIcon = service.category && service.category.toLowerCase() === 'laser'
                ? '<i class="fas fa-bolt" style="color: #ff9800; margin-right: 8px;"></i>'
                : '';

            item.innerHTML = `
                <input type="checkbox" value="${service.id}"
                       data-name="${service.name}"
                       data-price="${service.price}"
                       data-dur="${service.duration}"
                       data-confirm="${service.requiresConfirmation}"
                       data-category="${service.category || ''}">
                <span>${serviceIcon}${service.name}</span>
                <div class="price-tag">$${service.price}</div>
            `;

            item.onclick = (e) => {
                const cb = item.querySelector('input');
                if (e.target !== cb) {
                    cb.checked = !cb.checked;
                }
                updateBookingTotal();
            };

            tray.appendChild(item);
        });

        container.appendChild(catBtn);
        container.appendChild(tray);
    });
}

function updateBookingTotal() {
    const checked = Array.from(serviceCheckboxList.querySelectorAll('input:checked'));
    const totalMins = checked.reduce((sum, el) => sum + parseInt(el.dataset.dur), 0);
    const totalPrice = checked.reduce((sum, el) => sum + parseInt(el.dataset.price), 0);

    if (totalMins > 0) {
        bookingSummary.classList.remove('hidden');
        document.getElementById('sum-duration').innerText = totalMins;
        document.getElementById('sum-price').innerText = totalPrice;
        updateTechnicianOptions();
    } else {
        bookingSummary.classList.add('hidden');
        timeGrid.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Select services to see available times</p>';
        bookNowBtn.classList.add('hidden');
    }
}

function updateTechnicianOptions() {
    if (!techSelect) return;

    const checked = Array.from(serviceCheckboxList.querySelectorAll('input:checked'));
    const selectedServiceIds = checked.map(el => el.value);

    let availableTechs = technicians;
    if (currentUser && currentUser.role === 'specialist') {
        availableTechs = technicians.filter(tech =>
            tech.userId === currentUser.uid
        );
    }

    const qualifiedTechs = availableTechs.filter(tech => {
        if (selectedServiceIds.length === 0) return true;
        if (!tech.skills || !Array.isArray(tech.skills) || tech.skills.length === 0) {
            return false;
        }
        return selectedServiceIds.every(sId => tech.skills.includes(sId));
    });

    renderTechDropdown(qualifiedTechs);
}

function renderTechDropdown(techList) {
    const currentSelection = techSelect.value;

    techSelect.innerHTML = '<option value="" disabled selected>Select your preferred specialist...</option>';

    techList.forEach(t => {
        const selected = (t.name === currentSelection) ? 'selected' : '';
        techSelect.innerHTML += `<option value="${t.name}" ${selected}>${t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>`;
    });
}

function updateClientDropdowns() {
    if (techSelect) {
        updateTechnicianOptions();
    }
}

function generate15MinSlots() {
    const checked = Array.from(serviceCheckboxList.querySelectorAll('input:checked'));
    const totalMins = checked.reduce((sum, el) => sum + parseInt(el.dataset.dur), 0);

    if (totalMins === 0) return;

    timeGrid.innerHTML = '';
    const selectedDate = datePicker.value;
    const selectedTech = techSelect.value;

    if (!selectedTech || !selectedDate) {
        timeGrid.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Select a specialist to continue</p>';
        bookNowBtn.classList.add('hidden');
        return;
    }

    const dateObj = new Date(selectedDate + 'T00:00:00');
    if (dateObj.getDay() === 0 && currentUser && currentUser.role !== 'admin') {
        timeGrid.innerHTML = '<p style="text-align:center; padding:20px; color:var(--warning);"><i class="fas fa-exclamation-circle"></i> We are closed on Sundays</p>';
        bookNowBtn.classList.add('hidden');
        return;
    }

    let startMins = APP_SETTINGS.openingTime * 60;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const limitMins = isAdmin ? 1440 : (APP_SETTINGS.closingTime * 60);

    let slotsAdded = 0;

    while (startMins + totalMins <= limitMins) {
        const isBusy = checkTechBusy(selectedTech, selectedDate, startMins, totalMins);
        if (!isBusy) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.innerText = formatMinsToTime(startMins);
            slot.dataset.minutes = startMins;
            slot.onclick = () => selectSlot(slot);
            timeGrid.appendChild(slot);
            slotsAdded++;
        }
        startMins += APP_SETTINGS.slotInterval;
    }

    if (slotsAdded === 0) {
        timeGrid.innerHTML = '<p style="text-align:center; padding:20px; color:var(--warning);"><i class="fas fa-exclamation-circle"></i> No available slots for this date</p>';
        bookNowBtn.classList.add('hidden');
    }
}

function checkTechBusy(tech, date, startMins, duration) {
    return mockAppointments.some(appt => {
        if (appt.date !== date || appt.tech !== tech || appt.status === 'cancelled') return false;

        const apptStart = timeToMins(appt.time);
        const apptEnd = apptStart + appt.duration;
        const requestEnd = startMins + duration;

        return (startMins < apptEnd && requestEnd > apptStart);
    });
}

function selectSlot(el) {
    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    bookNowBtn.classList.remove('hidden');
}

bookNowBtn.onclick = async () => {

    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Please login to book appointments', 'warning');
        showView('auth-section');
        return;
    }

    const selectedSlot = document.querySelector('.time-slot.selected');
    if (!selectedSlot) {
        showNotification('Please select a time slot', 'warning');
        return;
    }

    const checked = Array.from(serviceCheckboxList.querySelectorAll('input:checked'));
    const selectedServiceNames = checked.map(el => el.dataset.name);
    const selectedServiceIds = checked.map(el => el.value);
    const needsApproval = checked.some(el => el.dataset.confirm === 'true');

    const totalDuration = parseInt(document.getElementById('sum-duration').innerText);
    const totalPrice = parseInt(document.getElementById('sum-price').innerText);

    const selectedSpecialistName = techSelect.value;
    const selectedSpecialist = technicians.find(t => t.name === selectedSpecialistName);

    if (!selectedSpecialist) {
        showNotification('Please select a valid specialist', 'warning');
        return;
    }

    const newBooking = {
        name: currentUser.name,
        phone: currentUser.phone,
        email: currentUser.email,
        userId: currentUser.uid,
        specialistId: selectedSpecialist.userId || "",
        services: selectedServiceNames,
        serviceIds: selectedServiceIds,
        tech: selectedSpecialistName,
        time: selectedSlot.innerText,
        duration: totalDuration,
        price: totalPrice,
        date: datePicker.value,
        status: needsApproval ? 'pending' : 'confirmed',
        createdAt: new Date().toISOString()
    };

    const appointmentsRef = window.dbRef(window.db, 'appointments');
    const newApptRef = window.dbPush(appointmentsRef);

    try {
        await window.dbSet(newApptRef, newBooking);
        console.log("Booking synced to Firebase!");

        playNotificationSound('booking');
        sendBookingNotification(newBooking);

        document.getElementById('modal-msg').innerText = newBooking.status === 'pending'
            ? "Your request has been sent! Awaiting confirmation."
            : "Your appointment has been confirmed successfully!";
        confirmModal.classList.add('active');

        serviceCheckboxList.querySelectorAll('input:checked').forEach(cb => cb.checked = false);
        techSelect.value = '';
        timeGrid.innerHTML = '';
        bookingSummary.classList.add('hidden');
        bookNowBtn.classList.add('hidden');
    } catch (error) {
        console.error("Firebase error:", error);
        showNotification('Failed to save booking. Please try again.', 'danger');
    }
};

// ==========================================
// CLIENT PROFILE
// ==========================================
function filterClientBookings(filter) {
    currentClientFilter = filter;

    document.querySelectorAll('.booking-filter-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.closest('.tab').classList.add('active');

    renderClientProfile();
}

function renderClientProfile() {
    const list = document.getElementById('client-bookings-list');
    if (!list || !currentUser) return;

    list.innerHTML = '';

    const myBookings = mockAppointments.filter(appt =>
        appt.userId === currentUser.uid || appt.email === currentUser.email || appt.phone === currentUser.phone
    );

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    let filteredBookings = [];

    if (currentClientFilter === 'upcoming') {
        filteredBookings = myBookings.filter(appt => {
            if (appt.status !== 'confirmed') return false;
            if (appt.date < today) return false;
            if (appt.date === today) {
                const apptTime = timeToMins(appt.time);
                const nowMins = now.getHours() * 60 + now.getMinutes();
                return apptTime > nowMins;
            }
            return true;
        });
    } else if (currentClientFilter === 'pending') {
        filteredBookings = myBookings.filter(appt => appt.status === 'pending');
    } else if (currentClientFilter === 'past') {
        filteredBookings = myBookings.filter(appt => {
            if (appt.date < today) return true;
            if (appt.date === today && appt.status === 'confirmed') {
                const apptTime = timeToMins(appt.time);
                const nowMins = now.getHours() * 60 + now.getMinutes();
                return apptTime <= nowMins;
            }
            return false;
        });
    }

    if (filteredBookings.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-times"></i>
                <p>No ${currentClientFilter} appointments found</p>
            </div>
        `;
        return;
    }

    filteredBookings.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });

    filteredBookings.forEach(appt => {
        const div = document.createElement('div');
        div.className = 'appointment-card';
        div.innerHTML = `
            <div class="appt-info">
                <h4><i class="fas fa-cut"></i> ${appt.services.join(', ')}</h4>
                <p><i class="fas fa-user-tie"></i> With ${appt.tech.toUpperCase()}</p>
                <p><i class="fas fa-calendar"></i> ${appt.date} at ${appt.time}</p>
                <p><i class="fas fa-clock"></i> Duration: ${appt.duration} minutes</p>
                <p><i class="fas fa-dollar-sign"></i> Price: $${appt.price}</p>
                <span class="status-badge status-${appt.status}">
                    <i class="fas fa-${appt.status === 'confirmed' ? 'check-circle' : appt.status === 'pending' ? 'clock' : 'history'}"></i>
                    ${appt.status.toUpperCase()}
                </span>
            </div>
            <div class="appt-time">${appt.time}</div>
        `;
        list.appendChild(div);
    });
}

// ==========================================
// SPECIALIST SCHEDULE
// ==========================================
function renderSpecialistSchedule() {
    const container = document.getElementById('specialist-calendar-container');
    if (!container || !currentUser || currentUser.role !== 'specialist') return;

    const filterDate = document.getElementById('specialist-date-filter')?.value || new Date().toISOString().split('T')[0];

    const myAppointments = mockAppointments.filter(appt =>
        (appt.specialistId === currentUser.uid || appt.tech === currentUser.name) &&
        appt.date === filterDate &&
        appt.status === 'confirmed'
    ).sort((a, b) => a.time.localeCompare(b.time));

    container.innerHTML = `
        <div class="specialist-day-header">
            <h3 style="font-family: 'Playfair Display'; font-size: 1.5rem; margin-bottom: 20px;">
                <i class="fas fa-calendar-day"></i>
                ${new Date(filterDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            <div class="specialist-stats">
                <div class="stat-badge">
                    <i class="fas fa-calendar-check"></i>
                    <span>${myAppointments.length} Appointments</span>
                </div>
                <div class="stat-badge">
                    <i class="fas fa-user"></i>
                    <span>${currentUser.name}</span>
                </div>
            </div>
        </div>
    `;

    if (myAppointments.length === 0) {
        container.innerHTML += `
            <div class="empty-state">
                <i class="fas fa-coffee"></i>
                <p>No appointments scheduled for this day</p>
                <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 10px;">
                    All appointments booked for ${currentUser.name} will appear here
                </p>
            </div>
        `;
        return;
    }

    myAppointments.forEach(appt => {
        const card = document.createElement('div');
        card.className = 'appointment-card';
        card.innerHTML = `
            <div class="appt-info">
                <h4><i class="fas fa-clock"></i> ${appt.time}</h4>
                <p><i class="fas fa-cut"></i> Services: ${appt.services.join(', ')}</p>
                <p><i class="fas fa-user"></i> Client: ${appt.name}</p>
                <p><i class="fas fa-hourglass-half"></i> Duration: ${appt.duration} minutes</p>
                <p><i class="fas fa-dollar-sign"></i> Total: $${appt.price}</p>
                <div style="margin-top: 10px; padding: 8px; background: var(--light-bg); border-radius: 8px;">
                    <small style="color: var(--text-muted);">
                        <i class="fas fa-info-circle"></i> Client contact hidden for privacy
                    </small>
                </div>
            </div>
            <div class="appt-time">${appt.time}</div>
        `;
        container.appendChild(card);
    });
}

if (document.getElementById('specialist-date-filter')) {
    document.getElementById('specialist-date-filter').value = new Date().toISOString().split('T')[0];
    document.getElementById('specialist-date-filter').addEventListener('change', renderSpecialistSchedule);
}

// ==========================================
// ADMIN DASHBOARD
// ==========================================
function refreshAdminData() {
    renderAdminInbox();
    updateAdminFilterDropdowns();
    renderAdminScheduler();
    renderStaffList();
    renderServiceList();
    updateLaserButton();
    renderClientHistory();
    renderReminders();
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.tab-btn').classList.add('active');

    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    const targetTab = document.getElementById(`admin-tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }

    if (tabName === 'schedule') {
        renderAdminScheduler();
    } else if (tabName === 'requests') {
        renderAdminInbox();
    } else if (tabName === 'staff') {
        renderStaffList();
    } else if (tabName === 'services') {
        renderServiceList();
        updateCategoryDropdown();
    } else if (tabName === 'history') {
        renderClientHistory();
    } else if (tabName === 'reminders') {
        renderReminders();
    } else if (tabName === 'reports') {
        generateReport();
    }
}

function renderAdminInbox() {
    let inbox = document.getElementById('admin-inbox');
    if (!inbox) return;

    const pending = mockAppointments.filter(a => a.status === 'pending');

    const badge = document.getElementById('pending-count-badge');
    if (badge) {
        if (pending.length > 0) {
            badge.textContent = pending.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    inbox.innerHTML = `
        <div class="card admin-card">
            <div class="card-subheader">
                <h3><i class="fas fa-bell"></i> Pending Requests (${pending.length})</h3>
                <p>Review and approve customer bookings</p>
            </div>
        </div>
    `;

    const card = inbox.querySelector('.card');

    if (pending.length === 0) {
        card.innerHTML += `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>All caught up! No pending requests.</p>
            </div>
        `;
    } else {
        pending.forEach(appt => {
            const div = document.createElement('div');
            div.className = 'appointment-card';
            div.innerHTML = `
                <div class="appt-info">
                    <h4><i class="fas fa-user"></i> ${appt.name}</h4>
                    <p><i class="fas fa-cut"></i> ${appt.services.join(' + ')}</p>
                    <p><i class="fas fa-calendar"></i> ${appt.date} @ ${appt.time}</p>
                    <p><i class="fas fa-phone"></i> ${appt.phone}</p>
                    <p><i class="fas fa-user-tie"></i> Specialist: ${appt.tech.toUpperCase()}</p>
                </div>
                <button class="btn-primary" style="width:auto; padding:12px 24px; margin:0;" onclick="confirmBooking('${appt.firebaseId}')">
                    <span>Approve</span>
                    <i class="fas fa-check"></i>
                </button>
            `;
            card.appendChild(div);
        });
    }
}

// FIX: Updated renderAdminScheduler with proper filtering and rendering
function renderAdminScheduler() {
    const grid = document.getElementById('scheduler-grid');
    if (!grid) return;

    const dateVal = document.getElementById('admin-date-filter')?.value || "";
    const techVal = document.getElementById('admin-tech-filter')?.value || "all";
    const categoryVal = document.getElementById('admin-service-filter')?.value || "all";

    if (technicians.length === 0) {
        grid.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div class="loading-spinner">
                    <div></div><div></div><div></div><div></div>
                </div>
                <p style="color: var(--text-muted); margin-top: 20px;">
                    Loading schedule data...
                </p>
            </div>
        `;
        return;
    }

    const techsToShow = techVal === "all" ? technicians : technicians.filter(t => t.name === techVal);

    if (techsToShow.length === 0) {
        grid.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-muted);">No technicians match the selected filters. Try changing filters or add team members in Settings.</p>';
        return;
    }

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `90px repeat(${techsToShow.length}, minmax(180px, 1fr))`;

    const headerTime = document.createElement('div');
    headerTime.className = 'grid-header';
    headerTime.innerHTML = '<i class="fas fa-clock"></i> TIME';
    grid.appendChild(headerTime);

    techsToShow.forEach(t => {
        const h = document.createElement('div');
        h.className = 'grid-header';
        h.innerHTML = `<i class="fas fa-user-tie"></i> ${t.name.toUpperCase()}`;
        grid.appendChild(h);
    });

    const totalSlots = ((APP_SETTINGS.closingTime - APP_SETTINGS.openingTime) * 60) / 15;

    for (let i = 0; i <= totalSlots; i++) {
        let mins = (APP_SETTINGS.openingTime * 60) + (i * 15);
        let timeLabel = (mins % 60 === 0) ? formatMinsToTime(mins) : "";
        let timeStr = formatMinsToTime(mins);

        const lbl = document.createElement('div');
        lbl.className = 'time-label';
        lbl.style.gridRow = i + 2;
        lbl.innerText = timeLabel;
        grid.appendChild(lbl);

        techsToShow.forEach((tech, index) => {
            const colIndex = index + 2;
            const cell = document.createElement('div');
            cell.className = 'empty-grid-cell';
            cell.style.gridColumn = colIndex;
            cell.style.gridRow = i + 2;
            cell.onclick = () => openAdminBookingModal(dateVal, timeStr, tech.name);
            grid.appendChild(cell);
        });
    }

    // FIX: Improved appointment filtering logic
    mockAppointments.forEach(appt => {
        if (appt.status !== 'confirmed') return;

        const matchesDate = !dateVal || appt.date === dateVal;
        const matchesTech = techVal === 'all' || appt.tech === techVal;
        
        // FIX: Proper category filtering - check if ANY of the appointment's services match the category
        let matchesCategory = categoryVal === 'all';
        if (!matchesCategory && appt.serviceIds && Array.isArray(appt.serviceIds)) {
            matchesCategory = appt.serviceIds.some(serviceId => {
                const service = services.find(s => s.id === serviceId);
                return service && service.category === categoryVal;
            });
        }

        if (matchesDate && matchesTech && matchesCategory) {
            const colIndex = techsToShow.findIndex(t => t.name === appt.tech);
            if (colIndex === -1) return;

            const startMins = timeToMins(appt.time) - (APP_SETTINGS.openingTime * 60);
            const startRow = (startMins / 15) + 2;
            const rowSpan = Math.ceil(appt.duration / 15);

            const apptEl = document.createElement('div');
            apptEl.className = 'booking-block';
            apptEl.style.gridColumn = colIndex + 2;
            apptEl.style.gridRow = `${startRow} / span ${rowSpan}`;
            apptEl.innerHTML = `
                <button class="cancel-appt-btn" onclick="deleteAppointment('${appt.firebaseId}')" title="Cancel appointment">×</button>
                <div class="client-name"><i class="fas fa-user"></i> ${appt.name}</div>
                <div class="service-name"><i class="fas fa-cut"></i> ${appt.services.join(', ')}</div>
                <div style="font-size:0.75rem; opacity:0.9; margin-top:4px;"><i class="fas fa-clock"></i> ${appt.time}</div>
            `;
            grid.appendChild(apptEl);
        }
    });
}

// FIX: Updated updateAdminFilterDropdowns to populate category filter
function updateAdminFilterDropdowns() {
    const techFilter = document.getElementById('admin-tech-filter');
    const serviceFilter = document.getElementById('admin-service-filter');

    if (techFilter) {
        const currentTech = techFilter.value;
        techFilter.innerHTML = '<option value="all">All Specialists</option>';
        technicians.forEach(t => {
            const selected = t.name === currentTech ? 'selected' : '';
            techFilter.innerHTML += `<option value="${t.name}" ${selected}>${t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>`;
        });
    }

    // FIX: Populate category filter with unique categories from services
    if (serviceFilter) {
        const currentCategory = serviceFilter.value;
        const categories = new Set();
        services.forEach(service => {
            if (service.category) {
                categories.add(service.category);
            }
        });

        serviceFilter.innerHTML = '<option value="all">All Categories</option>';
        Array.from(categories).sort().forEach(cat => {
            const selected = cat === currentCategory ? 'selected' : '';
            serviceFilter.innerHTML += `<option value="${cat}" ${selected}>${cat}</option>`;
        });
    }
}

// ==========================================
// ADMIN BOOKING MODAL (FIXED WITH 15MIN SLOTS)
// ==========================================
function openAdminBookingModal(presetDate, presetTime, presetTech) {
    const modal = document.getElementById('admin-booking-modal');
    modal.classList.add('active');

    // Store context for later use
    adminBookingContext = { presetDate, presetTime, presetTech };

    // Populate technician dropdown
    const techSelect = document.getElementById('admin-booking-tech');
    techSelect.innerHTML = '<option value="">Choose specialist...</option>';
    technicians.forEach(tech => {
        const selected = (tech.name === presetTech) ? 'selected' : '';
        techSelect.innerHTML += `<option value="${tech.name}" ${selected}>${tech.name}</option>`;
    });

    // Set date
    const dateInput = document.getElementById('admin-booking-date');
    dateInput.value = presetDate || new Date().toISOString().split('T')[0];

    // Render services
    renderAdminBookingServices();

    // Clear previous selections
    document.getElementById('admin-client-name').value = '';
    document.getElementById('admin-client-phone').value = '';
    document.getElementById('admin-time-slots').innerHTML = '';
    document.getElementById('admin-booking-details').classList.add('hidden');
}

function closeAdminBookingModal() {
    document.getElementById('admin-booking-modal').classList.remove('active');
    document.getElementById('admin-client-name').value = '';
    document.getElementById('admin-client-phone').value = '';
    document.getElementById('admin-booking-date').value = '';
    document.getElementById('admin-booking-tech').value = '';
    document.querySelectorAll('#admin-service-checkbox-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('admin-time-slots').innerHTML = '';
    document.getElementById('admin-booking-details').classList.add('hidden');
    adminBookingContext = null;
}

function renderAdminBookingServices() {
    const container = document.getElementById('admin-service-checkbox-list');
    if (!container) return;

    container.innerHTML = '';

    const categories = {};
    services.forEach(service => {
        let catName = service.category || "General Services";
        if (!categories[catName]) categories[catName] = [];
        categories[catName].push(service);
    });

    Object.keys(categories).forEach(catName => {
        const catBtn = document.createElement('button');
        catBtn.className = 'category-toggle-btn';
        catBtn.innerHTML = `<span>${catName}</span>`;
        catBtn.onclick = (e) => {
            e.preventDefault();
            const isActive = catBtn.classList.toggle('active');
            tray.classList.toggle('hidden', !isActive);
        };

        const tray = document.createElement('div');
        tray.className = 'service-tray hidden';

        categories[catName].forEach(service => {
            const item = document.createElement('div');
            item.className = 'checkbox-item';
            item.innerHTML = `
                <input type="checkbox"
                       value="${service.id}"
                       data-name="${service.name}"
                       data-price="${service.price}"
                       data-dur="${service.duration}"
                       onchange="updateAdminBookingTotal()">
                <span>${service.name}</span>
                <div class="price-tag">$${service.price}</div>
            `;
            tray.appendChild(item);
        });

        container.appendChild(catBtn);
        container.appendChild(tray);
    });
}

// FIX: Generate 15-minute time slots for admin booking
function updateAdminBookingTotal() {
    const checkboxes = document.querySelectorAll('#admin-service-checkbox-list input[type="checkbox"]:checked');
    const detailsDiv = document.getElementById('admin-booking-details');
    const timeSlotsContainer = document.getElementById('admin-time-slots');

    if (checkboxes.length > 0) {
        let total = 0;
        let totalDuration = 0;
        let serviceNames = [];

        checkboxes.forEach(cb => {
            total += parseFloat(cb.dataset.price);
            totalDuration += parseInt(cb.dataset.dur);
            serviceNames.push(cb.dataset.name);
        });

        detailsDiv.innerHTML = `
            <h4>Booking Summary</h4>
            <p><strong>Services:</strong> ${serviceNames.join(', ')}</p>
            <p><strong>Total Duration:</strong> ${totalDuration} minutes</p>
            <p><strong>Total Price:</strong> $${total}</p>
        `;
        detailsDiv.classList.remove('hidden');

        // FIX: Generate 15min time slots like client booking
        generateAdminTimeSlots(totalDuration);
    } else {
        detailsDiv.classList.add('hidden');
        timeSlotsContainer.innerHTML = '';
    }
}

// FIX: New function to generate 15min time slots with busy checking for admin
function generateAdminTimeSlots(totalDuration) {
    const timeSlotsContainer = document.getElementById('admin-time-slots');
    const selectedDate = document.getElementById('admin-booking-date').value;
    const selectedTech = document.getElementById('admin-booking-tech').value;

    if (!selectedDate || !selectedTech || totalDuration === 0) {
        timeSlotsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Select date, specialist, and services to see available times</p>';
        return;
    }

    timeSlotsContainer.innerHTML = '';

    let startMins = APP_SETTINGS.openingTime * 60;
    const limitMins = APP_SETTINGS.closingTime * 60;

    let slotsAdded = 0;

    while (startMins + totalDuration <= limitMins) {
        const isBusy = checkTechBusy(selectedTech, selectedDate, startMins, totalDuration);
        if (!isBusy) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.innerText = formatMinsToTime(startMins);
            slot.dataset.minutes = startMins;
            slot.onclick = () => selectAdminTimeSlot(slot);
            
            // Pre-select if matches preset time
            if (adminBookingContext && adminBookingContext.presetTime === slot.innerText) {
                slot.classList.add('selected');
            }
            
            timeSlotsContainer.appendChild(slot);
            slotsAdded++;
        }
        startMins += APP_SETTINGS.slotInterval;
    }

    if (slotsAdded === 0) {
        timeSlotsContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--warning);"><i class="fas fa-exclamation-circle"></i> No available slots for this date</p>';
    }
}

function selectAdminTimeSlot(el) {
    document.querySelectorAll('#admin-time-slots .time-slot').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
}

// FIX: Updated confirmAdminBooking to work with the new time slot system
async function confirmAdminBooking() {
    const clientName = document.getElementById('admin-client-name').value.trim();
    const clientPhone = document.getElementById('admin-client-phone').value.trim();
    const date = document.getElementById('admin-booking-date').value;
    const techName = document.getElementById('admin-booking-tech').value;
    const selectedTimeSlot = document.querySelector('#admin-time-slots .time-slot.selected');

    const selectedServices = Array.from(document.querySelectorAll('#admin-service-checkbox-list input[type="checkbox"]:checked'));

    if (!clientName || !clientPhone || !date || !techName || !selectedTimeSlot || selectedServices.length === 0) {
        showNotification('Please fill all fields and select a time slot', 'warning');
        return;
    }

    const time = selectedTimeSlot.innerText;
    const selectedSpecialist = technicians.find(t => t.name === techName);

    const bookingData = {
        name: clientName,
        phone: clientPhone,
        email: 'booked-by-admin@salon.com',
        userId: "ADMIN_MANUAL",
        specialistId: selectedSpecialist ? (selectedSpecialist.userId || "") : "",
        services: selectedServices.map(cb => cb.dataset.name),
        serviceIds: selectedServices.map(cb => cb.value),
        tech: techName,
        time: time,
        duration: selectedServices.reduce((sum, cb) => sum + parseInt(cb.dataset.dur || 30), 0),
        price: selectedServices.reduce((sum, cb) => sum + parseFloat(cb.dataset.price || 0), 0),
        date: date,
        status: 'confirmed',
        createdAt: new Date().toISOString()
    };

    try {
        const appointmentsRef = window.dbRef(window.db, 'appointments');
        const newApptRef = window.dbPush(appointmentsRef);
        await window.dbSet(newApptRef, bookingData);

        showNotification('Appointment created successfully!', 'success');
        closeAdminBookingModal();

        // FIX: Check if user exists and sync
        await syncPhoneLinkedAppointments(null, clientPhone);

        renderAdminScheduler();
    } catch (error) {
        console.error("Admin booking error:", error);
        showNotification('Failed to save booking', 'danger');
    }
}

// ==========================================
// STAFF MANAGEMENT
// ==========================================
function renderStaffList() {
    const container = document.getElementById('staff-list-container');
    if (!container) return;

    if (technicians.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-muted);">No staff members yet</p>';
        return;
    }

    container.innerHTML = technicians.map(staff => `
        <div class="mgmt-item">
            <div class="mgmt-info">
                <h4>${staff.name}</h4>
                <p>${staff.email || 'No email'} | ${staff.phone || 'No phone'}</p>
                <p style="font-size: 0.85rem; color: var(--text-muted);">
                    <i class="fas fa-briefcase"></i> ${staff.skills ? staff.skills.length : 0} skills assigned
                </p>
            </div>
            <div class="mgmt-actions">
                <button onclick="openSkillsModal('${staff.id}')" class="btn-skills">
                    <i class="fas fa-cogs"></i> Manage Skills
                </button>
                <button onclick="deleteStaff('${staff.id}')" class="btn-delete-small">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function addStaff() {
    const name = document.getElementById('new-staff-name').value.trim();
    const email = document.getElementById('new-staff-email').value.trim();
    const phone = document.getElementById('new-staff-phone').value.trim();
    const password = document.getElementById('new-staff-password').value.trim();
    const role = document.getElementById('new-staff-role').value;

    if (!name || !email || !phone || !password) {
        showNotification('Please fill all fields including password', 'warning');
        return;
    }
      // Store admin credentials to re-authenticate after creating new user
    const adminEmail = currentUser.email;
    const adminPassword = prompt('Please enter your admin password to confirm:');
    
    if (!adminPassword) {
        showNotification('Admin password required to add staff', 'warning');
        return;
    }
    try {
        const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
        const newUserId = userCredential.user.uid;
        const userData = {
            email: email,
            name: name,
            phone: phone,
            role: role,
            createdAt: new Date().toISOString()
        };


        const staffData = {
            name: name,
            email: email,
            phone: phone,
            userId: newUserId,
            skills: [],
            createdAt: new Date().toISOString()
        };

             // Immediately sign back in as admin to restore admin context
        await window.signInWithEmailAndPassword(window.auth, adminEmail, adminPassword);

        // Now write data with admin privileges
        const userRef = window.dbRef(window.db, `users/${newUserId}`);
        await window.dbSet(userRef, userData);

                const techRef = window.dbRef(window.db, 'technicians');
                const newTechRef = window.dbPush(techRef);
                await window.dbSet(newTechRef, staffData);

        document.getElementById('new-staff-name').value = '';
        document.getElementById('new-staff-email').value = '';
        document.getElementById('new-staff-phone').value = '';
        document.getElementById('new-staff-password').value = '';

        showNotification('Staff member added with account created!', 'success');
        
        // FIX: Force refresh of scheduler to show new staff column
        setTimeout(() => {
            renderAdminScheduler();
        }, 500);
    } catch (error) {
        console.error("Add staff error:", error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification('Email already in use', 'danger');
                    } else if (error.code === 'auth/wrong-password') {
            showNotification('Incorrect admin password', 'danger');
        } else {
            showNotification('Failed to add staff: ' + error.message, 'danger');
        }
    }
}

async function deleteStaff(staffId) {
    if (!confirm('Are you sure you want to delete this staff member?')) return;

    try {
        const techRef = window.dbRef(window.db, `technicians/${staffId}`);
        await window.dbRemove(techRef);
        showNotification('Staff member deleted', 'info');
        
        // FIX: Force refresh of scheduler after staff deletion
        setTimeout(() => {
            renderAdminScheduler();
        }, 500);
    } catch (error) {
        console.error("Delete staff error:", error);
        showNotification('Failed to delete staff', 'danger');
    }
}

function openSkillsModal(staffId) {
    currentEditingStaff = staffId;
    const staff = technicians.find(t => t.id === staffId);

    if (!staff) return;

    document.getElementById('skills-modal-title').textContent = `Manage Skills for ${staff.name.toUpperCase()}`;
    document.getElementById('skills-modal').classList.add('active');

    renderSkillsModalContent(staff);
}

function renderSkillsModalContent(staff) {
    const container = document.getElementById('skills-checkbox-list');
    container.innerHTML = '';

    const categories = {};
    services.forEach(service => {
        let catName = service.category || "General Services";
        if (!categories[catName]) categories[catName] = [];
        categories[catName].push(service);
    });

    Object.keys(categories).forEach(catName => {
        const catBtn = document.createElement('button');
        catBtn.className = 'category-toggle-btn';
        catBtn.innerHTML = `<span>${catName}</span>`;
        catBtn.onclick = (e) => {
            e.preventDefault();
            const isActive = catBtn.classList.toggle('active');
            tray.classList.toggle('hidden', !isActive);
        };

        const tray = document.createElement('div');
        tray.className = 'service-tray hidden';

        categories[catName].forEach(service => {
            const isChecked = staff.skills && staff.skills.includes(service.id);
            const item = document.createElement('div');
            item.className = 'checkbox-item';
            item.innerHTML = `
                <input type="checkbox"
                       value="${service.id}"
                       ${isChecked ? 'checked' : ''}>
                <span>${service.name}</span>
            `;
            tray.appendChild(item);
        });

        container.appendChild(catBtn);
        container.appendChild(tray);
    });
}

function closeSkillsModal() {
    document.getElementById('skills-modal').classList.remove('active');
    currentEditingStaff = null;
}

async function saveStaffSkills() {
    if (!currentEditingStaff) return;

    const selectedSkills = Array.from(
        document.querySelectorAll('#skills-checkbox-list input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    try {
        const techRef = window.dbRef(window.db, `technicians/${currentEditingStaff}`);
        await window.dbUpdate(techRef, { skills: selectedSkills });

        showNotification('Skills updated successfully', 'success');
        closeSkillsModal();
    } catch (error) {
        console.error("Save skills error:", error);
        showNotification('Failed to update skills', 'danger');
    }
}

// ==========================================
// SERVICES MANAGEMENT (FIXED WITH CATEGORY DROPDOWN)
// ==========================================
function renderServiceList() {
    const container = document.getElementById('service-list-container');
    if (!container) return;

    if (services.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-muted);">No services yet</p>';
        return;
    }

    const categories = {};
    services.forEach(service => {
        let catName = service.category || "General Services";
        if (!categories[catName]) categories[catName] = [];
        categories[catName].push(service);
    });

    container.innerHTML = Object.keys(categories).map(catName => `
        <div style="margin-bottom: 30px;">
            <h4 style="font-family: 'Playfair Display'; font-size: 1.3rem; margin-bottom: 15px; color: var(--primary-dark); border-bottom: 2px solid var(--primary-tan); padding-bottom: 10px;">
                ${catName}
            </h4>
            ${categories[catName].map(service => `
                <div class="mgmt-item">
                    <div class="mgmt-info">
                        <h4>${service.name}</h4>
                        <p>
                            <span class="price-tag">$${service.price || 0}</span>
                            <span style="margin-left: 15px;"><i class="fas fa-clock"></i> ${service.duration || 30} min</span>
                            ${service.requiresConfirmation ? '<span class="badge-confirm"><i class="fas fa-shield-alt"></i> Requires Approval</span>' : ''}
                        </p>
                    </div>
                    <div class="mgmt-actions">
                        <button onclick="deleteService('${service.id}')" class="btn-delete-small">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// FIX: Update category dropdown with existing categories
function updateCategoryDropdown() {
    const categorySelect = document.getElementById('new-service-category');
    if (!categorySelect) return;

    const currentValue = categorySelect.value;
    
    // Get unique categories
    const categories = new Set();
    services.forEach(service => {
        if (service.category) {
            categories.add(service.category);
        }
    });

    // Build dropdown HTML
    categorySelect.innerHTML = '<option value="">Select Category...</option>';
    
    Array.from(categories).sort().forEach(cat => {
        const selected = cat === currentValue ? 'selected' : '';
        categorySelect.innerHTML += `<option value="${cat}" ${selected}>${cat}</option>`;
    });
    
    categorySelect.innerHTML += '<option value="__ADD_NEW__">➕ Add New Category</option>';

    // Handle "Add New Category" selection
    categorySelect.onchange = function() {
        if (this.value === '__ADD_NEW__') {
            const newCategory = prompt('Enter new category name:');
            if (newCategory && newCategory.trim()) {
                const trimmedCategory = newCategory.trim();
                this.innerHTML = this.innerHTML.replace(
                    '<option value="__ADD_NEW__">➕ Add New Category</option>',
                    `<option value="${trimmedCategory}" selected>${trimmedCategory}</option><option value="__ADD_NEW__">➕ Add New Category</option>`
                );
                this.value = trimmedCategory;
            } else {
                this.value = '';
            }
        }
    };
}

async function addService() {
    const name = document.getElementById('new-service-name').value.trim();
    const category = document.getElementById('new-service-category').value.trim();
    const price = parseFloat(document.getElementById('new-service-price').value) || 0;
    const duration = parseInt(document.getElementById('new-service-dur').value) || 30;
    const requiresConfirmation = document.getElementById('new-service-confirm').checked;

    if (!name) {
        showNotification('Please enter service name', 'warning');
        return;
    }

    if (!category || category === '__ADD_NEW__') {
        showNotification('Please select or add a category', 'warning');
        return;
    }

    const serviceData = {
        name: name,
        category: category,
        price: price,
        duration: duration,
        requiresConfirmation: requiresConfirmation,
        createdAt: new Date().toISOString()
    };

    try {
        const servicesRef = window.dbRef(window.db, 'services');
        await window.dbPush(servicesRef).then(ref => window.dbSet(ref, serviceData));

        document.getElementById('new-service-name').value = '';
        document.getElementById('new-service-category').value = '';
        document.getElementById('new-service-price').value = '';
        document.getElementById('new-service-dur').value = '';
        document.getElementById('new-service-confirm').checked = false;

        showNotification('Service added successfully', 'success');
    } catch (error) {
        console.error("Add service error:", error);
        showNotification('Failed to add service', 'danger');
    }
}

async function deleteService(serviceId) {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
        const serviceRef = window.dbRef(window.db, `services/${serviceId}`);
        await window.dbRemove(serviceRef);
        showNotification('Service deleted', 'info');
    } catch (error) {
        console.error("Delete service error:", error);
        showNotification('Failed to delete service', 'danger');
    }
}

// ==========================================
// CLIENT HISTORY
// ==========================================
function renderClientHistory() {
    const searchInput = document.getElementById('client-search-input');
    if (searchInput) {
        searchInput.oninput = performClientSearch;
    }

    const resultsContainer = document.getElementById('client-history-results');
    if (resultsContainer) {
        resultsContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;"><i class="fas fa-search"></i><br>Search for a client by name or phone number</p>';
    }
}

function performClientSearch() {
    const searchTerm = document.getElementById('client-search-input').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('client-history-results');

    if (!searchTerm) {
        resultsContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;"><i class="fas fa-search"></i><br>Search for a client by name or phone number</p>';
        return;
    }

    const clientAppointments = {};

    mockAppointments.forEach(appt => {
        const matchesName = appt.name && appt.name.toLowerCase().includes(searchTerm);
        const matchesPhone = appt.phone && appt.phone.includes(searchTerm);

        if (matchesName || matchesPhone) {
            const key = appt.phone || appt.name;
            if (!clientAppointments[key]) {
                clientAppointments[key] = {
                    name: appt.name,
                    phone: appt.phone,
                    email: appt.email,
                    appointments: []
                };
            }
            clientAppointments[key].appointments.push(appt);
        }
    });

    const clients = Object.values(clientAppointments);

    if (clients.length === 0) {
        resultsContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px;"><i class="fas fa-user-slash"></i><br>No clients found</p>';
        return;
    }

    resultsContainer.innerHTML = clients.map(client => {
        client.appointments.sort((a, b) => {
            const dateA = new Date(a.date + 'T' + a.time);
            const dateB = new Date(b.date + 'T' + b.time);
            return dateB - dateA;
        });

        const upcomingCount = client.appointments.filter(a => {
            const apptDate = new Date(a.date + 'T' + a.time);
            return apptDate >= new Date() && a.status !== 'cancelled';
        }).length;

        const completedCount = client.appointments.filter(a => {
            const apptDate = new Date(a.date + 'T' + a.time);
            return apptDate < new Date() && a.status === 'confirmed';
        }).length;

        return `
            <div class="client-history-card">
                <div class="client-info-header">
                    <div>
                        <h3><i class="fas fa-user-circle"></i> ${client.name}</h3>
                        <p><i class="fas fa-phone"></i> ${client.phone || 'N/A'}</p>
                        <p><i class="fas fa-envelope"></i> ${client.email || 'N/A'}</p>
                    </div>
                    <div class="client-stats">
                        <div class="stat-badge">
                            <i class="fas fa-calendar-check"></i>
                            <span>${upcomingCount} Upcoming</span>
                        </div>
                        <div class="stat-badge">
                            <i class="fas fa-check-circle"></i>
                            <span>${completedCount} Completed</span>
                        </div>
                    </div>
                </div>

                <div class="client-appointments-list">
                    <h4 style="margin-bottom: 15px; color: var(--primary-dark);">Appointment History</h4>
                    ${client.appointments.map(appt => {
                        const statusClass = appt.status === 'confirmed' ? 'success' :
                                          appt.status === 'pending' ? 'warning' : 'muted';
                        const statusIcon = appt.status === 'confirmed' ? 'fa-check-circle' :
                                         appt.status === 'pending' ? 'fa-clock' : 'fa-times-circle';

                        return `
                            <div class="appointment-mini-card">
                                <div class="appt-mini-header">
                                    <span><strong>${new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong> at ${appt.time}</span>
                                    <span class="badge badge-${statusClass}">
                                        <i class="fas ${statusIcon}"></i> ${appt.status}
                                    </span>
                                </div>
                                <div class="appt-mini-details">
                                    <p><i class="fas fa-user-tie"></i> ${appt.tech}</p>
                                    <p><i class="fas fa-concierge-bell"></i> ${Array.isArray(appt.services) ? appt.services.join(', ') : appt.services}</p>
                                    <p><i class="fas fa-dollar-sign"></i> $${appt.price}</p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// REMINDERS
// ==========================================
function renderReminders() {
    const container = document.getElementById('reminders-list');
    if (!container) return;

    const filterDate = document.getElementById('reminder-date-filter').value;
    const filterType = document.getElementById('reminder-type-filter').value;

    let upcomingAppointments = mockAppointments.filter(appt => {
        if (appt.status !== 'confirmed') return false;

        const apptDate = new Date(appt.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filterDate) {
            return appt.date === filterDate;
        } else {
            const weekFromNow = new Date(today);
            weekFromNow.setDate(today.getDate() + 7);
            return apptDate >= today && apptDate <= weekFromNow;
        }
    });

    if (upcomingAppointments.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fas fa-bell-slash"></i><br>No upcoming appointments to send reminders</p>';
        return;
    }

    const reminders = [];

    upcomingAppointments.forEach(appt => {
        const apptDate = new Date(appt.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((apptDate - today) / (1000 * 60 * 60 * 24));

        if (filterType === 'all' || filterType === 'client') {
            if (appt.phone) {
                reminders.push({
                    type: 'client',
                    appointment: appt,
                    daysUntil: daysUntil,
                    phone: appt.phone,
                    name: appt.name
                });
            }
        }

        if (filterType === 'all' || filterType === 'staff') {
            const specialist = technicians.find(t => t.name === appt.tech);
            if (specialist && specialist.phone) {
                reminders.push({
                    type: 'staff',
                    appointment: appt,
                    daysUntil: daysUntil,
                    phone: specialist.phone,
                    name: specialist.name
                });
            }
        }
    });

    if (reminders.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fas fa-phone-slash"></i><br>No phone numbers available for reminders</p>';
        return;
    }

    container.innerHTML = reminders.map((reminder, index) => {
        const appt = reminder.appointment;
        const urgencyClass = reminder.daysUntil === 0 ? 'urgent' : reminder.daysUntil <= 1 ? 'soon' : '';
        const reminderKey = `${appt.firebaseId}_${reminder.type}`;
        const isSent = localStorage.getItem(`reminder_sent_${reminderKey}`) === 'true';

        return `
            <div class="reminder-card">
                <div class="reminder-header">
                    <div>
                        <h4>${reminder.type === 'client' ? 'Client' : 'Staff'} Reminder</h4>
                        <p><strong>${reminder.name}</strong></p>
                    </div>
                    <div class="days-badge ${urgencyClass}">
                        ${reminder.daysUntil === 0 ? 'Today' : reminder.daysUntil === 1 ? 'Tomorrow' : `In ${reminder.daysUntil} days`}
                    </div>
                </div>

                <div class="reminder-details">
                    <p><i class="fas fa-phone"></i> ${reminder.phone}</p>
                    <p><i class="fas fa-calendar"></i> ${appt.date} at ${appt.time}</p>
                    <p><i class="fas fa-concierge-bell"></i> ${appt.services.join(', ')}</p>
                    ${reminder.type === 'staff' ? `<p><i class="fas fa-user"></i> Client: ${appt.name}</p>` : ''}
                </div>

                <button
                    onclick="sendWhatsAppReminder('${reminderKey}', '${reminder.phone}', '${reminder.name}', '${appt.date}', '${appt.time}', '${appt.services.join(', ')}', '${reminder.type}')"
                    class="btn-reminder ${isSent ? 'sent' : ''}"
                    ${isSent ? 'disabled' : ''}>
                    <i class="fas ${isSent ? 'fa-check-circle' : 'fa-paper-plane'}"></i>
                    <span>${isSent ? 'Reminder Sent' : 'Send Reminder'}</span>
                </button>
            </div>
        `;
    }).join('');
}

function sendWhatsAppReminder(reminderKey, phone, name, date, time, services, type) {
    let message = '';

    if (type === 'client') {
        message = `Hello ${name}! 👋\n\nThis is a reminder for your appointment at Plume Blanche:\n\n📅 Date: ${date}\n⏰ Time: ${time}\n💅 Services: ${services}\n\nWe look forward to seeing you!\n\n- Plume Blanche Team`;
    } else {
        message = `Hello ${name}! 👋\n\nAppointment reminder:\n\n📅 Date: ${date}\n⏰ Time: ${time}\n💅 Services: ${services}\n\nThank you!\n\n- Plume Blanche`;
    }

    const cleanPhone = phone.replace('+', '');
    const whatsappURL = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, '_blank');

    localStorage.setItem(`reminder_sent_${reminderKey}`, 'true');
    renderReminders();

    showNotification('WhatsApp opened with reminder message', 'success');
}

// ==========================================
// REPORTS FEATURE (NEW - COMPREHENSIVE)
// ==========================================
function generateReport() {
    const reportType = document.getElementById('report-type-filter').value;
    const selectedDate = document.getElementById('report-date-filter').value || new Date().toISOString().split('T')[0];
    const container = document.getElementById('report-container');

    if (!container) return;

    // Calculate date range based on report type
    const { startDate, endDate } = getReportDateRange(reportType, selectedDate);

    // Filter appointments within date range
    const reportAppointments = mockAppointments.filter(appt => {
        const apptDate = new Date(appt.date);
        return apptDate >= startDate && apptDate <= endDate && appt.status === 'confirmed';
    });

    // Calculate metrics
    const metrics = calculateReportMetrics(reportAppointments);

    // Generate report HTML
    container.innerHTML = `
        <div class="card admin-card" style="margin-top: 30px;">
            <div class="card-subheader">
                <h3>
                    <i class="fas fa-chart-line"></i>
                    ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report
                </h3>
                <p>${formatDateRange(startDate, endDate)}</p>
            </div>

            <!-- Financial Metrics -->
            <div style="margin-bottom: 40px;">
                <h4 style="font-family: 'Playfair Display'; font-size: 1.5rem; margin-bottom: 20px; color: var(--primary-dark);">
                    <i class="fas fa-dollar-sign"></i> Financial Overview
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-hand-holding-usd"></i> Total Revenue
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            $${metrics.financial.totalRevenue}
                        </div>
                    </div>
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-chart-line"></i> Average Transaction
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            $${metrics.financial.avgTransaction}
                        </div>
                    </div>
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-receipt"></i> Total Appointments
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            ${metrics.financial.totalAppointments}
                        </div>
                    </div>
                </div>

                <h5 style="margin-top: 30px; margin-bottom: 15px; color: var(--primary-dark);">
                    <i class="fas fa-concierge-bell"></i> Revenue by Service
                </h5>
                <div style="background: white; padding: 20px; border-radius: 12px; border: 2px solid rgba(188, 148, 127, 0.2);">
                    ${metrics.financial.revenueByService.map(item => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(188, 148, 127, 0.1);">
                            <span style="font-weight: 600;">${item.service}</span>
                            <span style="color: var(--primary-dark); font-weight: 700;">$${item.revenue} <span style="color: var(--text-muted); font-size: 0.85rem;">(${item.count} bookings)</span></span>
                        </div>
                    `).join('')}
                </div>

                <h5 style="margin-top: 30px; margin-bottom: 15px; color: var(--primary-dark);">
                    <i class="fas fa-user-tie"></i> Revenue by Staff
                </h5>
                <div style="background: white; padding: 20px; border-radius: 12px; border: 2px solid rgba(188, 148, 127, 0.2);">
                    ${metrics.financial.revenueByStaff.map(item => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(188, 148, 127, 0.1);">
                            <span style="font-weight: 600;">${item.staff}</span>
                            <span style="color: var(--primary-dark); font-weight: 700;">$${item.revenue} <span style="color: var(--text-muted); font-size: 0.85rem;">(${item.count} appointments)</span></span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Client Metrics -->
            <div style="margin-bottom: 40px;">
                <h4 style="font-family: 'Playfair Display'; font-size: 1.5rem; margin-bottom: 20px; color: var(--primary-dark);">
                    <i class="fas fa-users"></i> Client Analytics
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-user-plus"></i> Total Clients
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            ${metrics.clients.totalClients}
                        </div>
                    </div>
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-star"></i> New Clients
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            ${metrics.clients.newClients}
                        </div>
                    </div>
                    <div class="stat-card" style="padding: 20px; background: var(--gradient-soft); border-radius: 16px; border: 2px solid rgba(188, 148, 127, 0.2);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fas fa-redo"></i> Returning Clients
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--primary-dark);">
                            ${metrics.clients.returningClients}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Staff Performance -->
            <div style="margin-bottom: 40px;">
                <h4 style="font-family: 'Playfair Display'; font-size: 1.5rem; margin-bottom: 20px; color: var(--primary-dark);">
                    <i class="fas fa-trophy"></i> Staff Performance
                </h4>
                <div style="background: white; padding: 20px; border-radius: 12px; border: 2px solid rgba(188, 148, 127, 0.2);">
                    ${metrics.staff.map(item => `
                        <div style="padding: 15px 0; border-bottom: 1px solid rgba(188, 148, 127, 0.1);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-weight: 700; font-size: 1.1rem;">${item.name}</span>
                                <span style="background: var(--gradient-primary); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">
                                    ${item.appointments} appointments
                                </span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px;">
                                <div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Revenue</div>
                                    <div style="font-weight: 700; color: var(--primary-dark);">$${item.revenue}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Hours Worked</div>
                                    <div style="font-weight: 700; color: var(--primary-dark);">${item.hoursWorked}h</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">Avg/Appointment</div>
                                    <div style="font-weight: 700; color: var(--primary-dark);">$${item.avgPerAppt}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Service Popularity -->
            <div>
                <h4 style="font-family: 'Playfair Display'; font-size: 1.5rem; margin-bottom: 20px; color: var(--primary-dark);">
                    <i class="fas fa-fire"></i> Service Popularity
                </h4>
                <div style="background: white; padding: 20px; border-radius: 12px; border: 2px solid rgba(188, 148, 127, 0.2);">
                    ${metrics.services.map((item, index) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(188, 148, 127, 0.1);">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <span style="font-weight: 700; font-size: 1.2rem; color: var(--primary-tan);">#${index + 1}</span>
                                <span style="font-weight: 600;">${item.service}</span>
                            </div>
                            <span style="color: var(--primary-dark); font-weight: 700;">${item.count} bookings</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <button class="btn-primary" onclick="exportReport()" style="margin-top: 30px; max-width: 300px; margin-left: auto; margin-right: auto;">
                <i class="fas fa-download"></i>
                <span>Export Report</span>
            </button>
        </div>
    `;
}

function getReportDateRange(reportType, selectedDate) {
    const date = new Date(selectedDate + 'T00:00:00');
    let startDate, endDate;

    switch (reportType) {
        case 'daily':
            startDate = new Date(date);
            endDate = new Date(date);
            break;
        case 'weekly':
            // Get start of week (Monday)
            const dayOfWeek = date.getDay();
            const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
            startDate = new Date(date);
            startDate.setDate(date.getDate() + diffToMonday);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            break;
        case 'monthly':
            startDate = new Date(date.getFullYear(), date.getMonth(), 1);
            endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            break;
        case 'yearly':
            startDate = new Date(date.getFullYear(), 0, 1);
            endDate = new Date(date.getFullYear(), 11, 31);
            break;
    }

    return { startDate, endDate };
}

function calculateReportMetrics(appointments) {
    // Financial metrics
    const totalRevenue = appointments.reduce((sum, appt) => sum + (appt.price || 0), 0);
    const avgTransaction = appointments.length > 0 ? Math.round(totalRevenue / appointments.length) : 0;

    // Revenue by service
    const serviceRevenue = {};
    appointments.forEach(appt => {
        if (Array.isArray(appt.services)) {
            appt.services.forEach(service => {
                if (!serviceRevenue[service]) {
                    serviceRevenue[service] = { count: 0, revenue: 0 };
                }
                serviceRevenue[service].count++;
                serviceRevenue[service].revenue += Math.round((appt.price || 0) / appt.services.length);
            });
        }
    });

    const revenueByService = Object.entries(serviceRevenue)
        .map(([service, data]) => ({ service, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

    // Revenue by staff
    const staffRevenue = {};
    appointments.forEach(appt => {
        if (!staffRevenue[appt.tech]) {
            staffRevenue[appt.tech] = { count: 0, revenue: 0 };
        }
        staffRevenue[appt.tech].count++;
        staffRevenue[appt.tech].revenue += appt.price || 0;
    });

    const revenueByStaff = Object.entries(staffRevenue)
        .map(([staff, data]) => ({ staff, ...data }))
        .sort((a, b) => b.revenue - a.revenue);

    // Client metrics
    const uniqueClients = new Set();
    const clientAppointmentCounts = {};
    
    appointments.forEach(appt => {
        const clientKey = appt.phone || appt.email;
        uniqueClients.add(clientKey);
        if (!clientAppointmentCounts[clientKey]) {
            clientAppointmentCounts[clientKey] = 0;
        }
        clientAppointmentCounts[clientKey]++;
    });

    const newClients = Object.values(clientAppointmentCounts).filter(count => count === 1).length;
    const returningClients = uniqueClients.size - newClients;

    // Staff performance
    const staffPerformance = Object.entries(staffRevenue).map(([name, data]) => {
        const staffAppts = appointments.filter(a => a.tech === name);
        const totalMinutes = staffAppts.reduce((sum, a) => sum + (a.duration || 0), 0);
        const hoursWorked = Math.round(totalMinutes / 60 * 10) / 10;
        const avgPerAppt = data.count > 0 ? Math.round(data.revenue / data.count) : 0;

        return {
            name,
            appointments: data.count,
            revenue: data.revenue,
            hoursWorked,
            avgPerAppt
        };
    }).sort((a, b) => b.revenue - a.revenue);

    // Service popularity
    const serviceCounts = {};
    appointments.forEach(appt => {
        if (Array.isArray(appt.services)) {
            appt.services.forEach(service => {
                serviceCounts[service] = (serviceCounts[service] || 0) + 1;
            });
        }
    });

    const servicePopularity = Object.entries(serviceCounts)
        .map(([service, count]) => ({ service, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        financial: {
            totalRevenue,
            avgTransaction,
            totalAppointments: appointments.length,
            revenueByService,
            revenueByStaff
        },
        clients: {
            totalClients: uniqueClients.size,
            newClients,
            returningClients
        },
        staff: staffPerformance,
        services: servicePopularity
    };
}

function formatDateRange(startDate, endDate) {
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Beirut' };
    const start = startDate.toLocaleDateString('en-US', options);
    const end = endDate.toLocaleDateString('en-US', options);
    
    if (start === end) {
        return start;
    }
    return `${start} - ${end}`;
}

function exportReport() {
    showNotification('Report export feature coming soon!', 'info');
}

// ==========================================
// SCHEDULE VIEWS
// ==========================================
function switchView(viewType) {
    if (viewType === 'daily') {
        document.getElementById('daily-view').classList.remove('hidden');
        document.getElementById('weekly-view').classList.add('hidden');
        document.querySelectorAll('.btn-view-toggle').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes('Daily')) btn.classList.add('active');
        });
        renderAdminScheduler();
    } else if (viewType === 'weekly') {
        document.getElementById('daily-view').classList.add('hidden');
        document.getElementById('weekly-view').classList.remove('hidden');
        document.querySelectorAll('.btn-view-toggle').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes('Weekly')) btn.classList.add('active');
        });
        renderWeeklyCalendar();
    }
}

function renderWeeklyCalendar() {
    const grid = document.getElementById('weekly-calendar');
    if (!grid) return;

    const today = new Date();
    today.setDate(today.getDate() + (weeklyViewOffset * 7));

    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    grid.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startOfWeek);
        currentDate.setDate(startOfWeek.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        const dayAppts = mockAppointments.filter(a =>
            a.date === dateStr && a.status === 'confirmed'
        );

        const card = document.createElement('div');
        card.className = 'day-preview-card';
        card.innerHTML = `
            <h4 style="font-family: 'Playfair Display'; font-size: 1.2rem; margin-bottom: 10px; color: var(--primary-dark);">
                ${currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h4>
            ${dayAppts.length > 0 ? `
                <div class="first-appt-badge">
                    <i class="fas fa-calendar-check"></i> ${dayAppts.length} Appointments
                </div>
                <div class="preview-list">
                    <div class="preview-item">
                        <span><i class="fas fa-clock"></i> First: ${dayAppts.sort((a, b) => a.time.localeCompare(b.time))[0].time}</span>
                    </div>
                </div>
                <button onclick="goToDate('${dateStr}')" class="btn-primary" style="width:100%; margin-top:15px; padding:10px;">
                    <span>View Schedule</span>
                    <i class="fas fa-arrow-right"></i>
                </button>
            ` : '<p style="text-align:center; color:var(--text-muted); padding:20px;"><i class="fas fa-calendar-times"></i><br>No appointments</p>'}
        `;
        grid.appendChild(card);
    }
}

function changeWeek(direction) {
    weeklyViewOffset += direction;
    renderWeeklyCalendar();
}

function goToDate(dateStr) {
    const dateInput = document.getElementById('admin-date-filter');
    if (dateInput) {
        dateInput.value = dateStr;
        switchView('daily');
    }
}

// ==========================================
// LASER SERVICES CONTROL
// ==========================================
function updateLaserButton() {
    const btn = document.getElementById('laser-toggle-btn');
    if (!btn) return;

    const selectedDate = document.getElementById('admin-date-filter')?.value;
    if (!selectedDate) return;

    const isEnabled = laserDates.includes(selectedDate);

    if (isEnabled) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-check-circle"></i> <span>Laser Enabled</span>';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> <span>Enable for Selected Date</span>';
    }
}

async function toggleLaserForDate() {
    const selectedDate = document.getElementById('admin-date-filter')?.value;
    if (!selectedDate) {
        showNotification('Please select a date first', 'warning');
        return;
    }

    const isEnabled = laserDates.includes(selectedDate);
    const laserRef = window.dbRef(window.db, 'laserDates');

    try {
        if (isEnabled) {
            // Remove date
            const snapshot = await window.dbGet(laserRef);
            if (snapshot.exists()) {
                const dates = snapshot.val();
                const keyToRemove = Object.keys(dates).find(key => dates[key] === selectedDate);
                if (keyToRemove) {
                    await window.dbRemove(window.dbRef(window.db, `laserDates/${keyToRemove}`));
                    showNotification('Laser services disabled for this date', 'info');
                }
            }
        } else {
            // Add date
            await window.dbPush(laserRef).then(ref => window.dbSet(ref, selectedDate));
            showNotification('Laser services enabled for this date', 'success');
        }
    } catch (error) {
        console.error("Laser toggle error:", error);
        showNotification('Failed to update laser availability', 'danger');
    }
}

// ==========================================
// APPOINTMENT ACTIONS
// ==========================================
async function confirmBooking(apptId) {
    if (!confirm('Approve this booking request?')) return;

    try {
        const apptRef = window.dbRef(window.db, `appointments/${apptId}`);
        await window.dbUpdate(apptRef, { status: 'confirmed' });
        showNotification('Booking approved!', 'success');
    } catch (error) {
        console.error("Confirm booking error:", error);
        showNotification('Failed to approve booking', 'danger');
    }
}

async function deleteAppointment(apptId) {
    if (!confirm('Cancel this appointment?')) return;

    try {
        const apptRef = window.dbRef(window.db, `appointments/${apptId}`);
        await window.dbRemove(apptRef);
        showNotification('Appointment cancelled', 'info');
    } catch (error) {
        console.error("Delete appointment error:", error);
        showNotification('Failed to cancel appointment', 'danger');
    }
}

// ==========================================
// NOTIFICATIONS
// ==========================================
let notificationChecker = null;
let lastNotificationCheck = Date.now();

function startNotificationChecker() {
    if (notificationChecker) clearInterval(notificationChecker);
    
    notificationChecker = setInterval(() => {
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
            // Check will be handled by Firebase listener
        }
    }, 30000); // Check every 30 seconds
}

function checkForNewNotifications(notifications) {
    notifications.forEach(notif => {
        const notifTime = new Date(notif.timestamp).getTime();
        
        // REMOVE the check against lastNotificationCheck for the initial load
        // Simply check if it's NOT READ
        if (!notif.read) {
            if (notif.type === 'new_booking' && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
                playNotificationSound('notification');
                showImmediateNotification('New Booking Request', notif.message, notif.key);
                sendPushNotification('New Booking Request', notif.message);
            }
        }
    });
    
    // Update the check time only AFTER processing
    lastNotificationCheck = Date.now();
}

function sendBookingNotification(booking) {
    const notificationData = {
        type: 'new_booking',
        message: `New booking from ${booking.name} for ${booking.services.join(', ')} on ${booking.date} at ${booking.time}`,
        timestamp: new Date().toISOString(),
        bookingId: booking.firebaseId || 'unknown'
    };

    const notifRef = window.dbRef(window.db, 'notifications');
    window.dbPush(notifRef).then(ref => window.dbSet(ref, notificationData));
}

function showImmediateNotification(title, message, notificationId = null) {
    // Check if this notification already exists on screen
    const existingNotif = document.querySelector(`[data-notification-id=\"${notificationId}\"]`);
    if (existingNotif) {
        return; // Don't show duplicate
    }

    const notifEl = document.createElement('div');
    notifEl.className = 'immediate-notification';
    if (notificationId) {
        notifEl.setAttribute('data-notification-id', notificationId);
    }
    
    notifEl.innerHTML = `
        <div class=\"notification-header\">
            <i class=\"fas fa-bell\"></i>
            <span>${title}</span>
            <button class=\"close-notification\" onclick=\"dismissNotification(this, '${notificationId}')\">×</button>
        </div>
        <div class=\"notification-body\">
            ${message}
        </div>
    `;
    
    // Add to a notification container or body
    let notifContainer = document.getElementById('notification-container');
    if (!notifContainer) {
        notifContainer = document.createElement('div');
        notifContainer.id = 'notification-container';
        notifContainer.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
        `;
        document.body.appendChild(notifContainer);
    }
    
    notifContainer.appendChild(notifEl);

    // Persistent notification - stays until dismissed
    // No auto-removal setTimeout
}

function dismissNotification(buttonElement, notificationId) {
    const notifEl = buttonElement.closest('.immediate-notification');
    notifEl.style.animation = 'slideOutRight 0.4s ease';
    setTimeout(() => {
        notifEl.remove();
        // Optionally mark as read in Firebase
        if (notificationId && notificationId !== 'null') {
            markNotificationAsRead(notificationId);
        }
    }, 400);
}

function markNotificationAsRead(notificationId) {
    try {
        const notifRef = window.dbRef(window.db, `notifications/${notificationId}`);
        window.dbUpdate(notifRef, { read: true, readAt: new Date().toISOString() });
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

function playNotificationSound(type) {
    // Browser notification sound (beep)
    try{
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = type === 'booking' ? 800 : 600;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

            // Play a second beep for emphasis
        setTimeout(() => {
            const oscillator2 = audioContext.createOscillator();
            const gainNode2 = audioContext.createGain();
            oscillator2.connect(gainNode2);
            gainNode2.connect(audioContext.destination);
            oscillator2.frequency.value = type === 'booking' ? 1000 : 800;
            oscillator2.type = 'sine';
            gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator2.start(audioContext.currentTime);
            oscillator2.stop(audioContext.currentTime + 0.5);
        }, 200);
        
    } catch (error) {
        console.log('Audio playback failed:', error);
        // Fallback: Try HTML5 Audio with data URI
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuByO7aizsKGWS67OihUBELTKXh8bllHgU2jdXxy3oqBSh+zPLZjjoIDFiv6OyrWBUIQ5zd8sFuJAYug8jv3Y0+CRdmsOvnolITC0mh4PG2ZSAGNo/X8sl8KgYpf87y2Ys8Cg5Zr+vqqlcVCkOc3fO/bSMGLoPI796PPgkXZ6/r56JTE');
            audio.play();
        } catch (e) {
            console.log('Fallback audio also failed:', e);
        }
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Notifications enabled");
                showNotification("Notifications enabled! You'll receive alerts for new bookings.", 'success');
            }
        });
    }
}

function sendPushNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: "https://customer-assets.emergentagent.com/job_hair-hub-12/artifacts/cprm0suq_0c1377bd-f4df-4c9c-922d-9f2e9eca59a7.jfif",
            badge: "https://customer-assets.emergentagent.com/job_hair-hub-12/artifacts/cprm0suq_0c1377bd-f4df-4c9c-922d-9f2e9eca59a7.jfif"
        });
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#6EBF8B' : type === 'danger' ? '#E76F51' : type === 'warning' ? '#F4A261' : '#2A9D8F'};
        color: white;
        padding: 18px 24px;
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 10000;
        font-weight: 600;
        animation: slideInRight 0.4s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
    `;

    const icon = type === 'success' ? 'fa-check-circle' :
                 type === 'danger' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';

    notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.4s ease';
        setTimeout(() => notification.remove(), 400);
    }, 3000);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function timeToMins(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatMinsToTime(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ==========================================
// INITIALIZATION
// ==========================================
datePicker?.addEventListener('change', () => {
    if (datePicker.value) {
        detailsForm.classList.remove('hidden');
        renderServiceCheckboxes();
        updateBookingTotal();
    }
});

if (techSelect) techSelect.onchange = () => {
    generate15MinSlots();
};

document.getElementById('admin-date-filter')?.addEventListener('change', () => {
    renderAdminScheduler();
    updateLaserButton();
});
document.getElementById('admin-tech-filter')?.addEventListener('change', renderAdminScheduler);
document.getElementById('admin-service-filter')?.addEventListener('change', renderAdminScheduler);

// Handle service changes for admin booking
document.getElementById('admin-booking-tech')?.addEventListener('change', () => {
    updateAdminBookingTotal();
});
document.getElementById('admin-booking-date')?.addEventListener('change', () => {
    updateAdminBookingTotal();
});

// Set min date for date pickers to today
const today = new Date().toISOString().split('T')[0];
if (datePicker) {
    datePicker.min = today;
    datePicker.value = today;
}
if (document.getElementById('admin-date-filter')) {
    document.getElementById('admin-date-filter').value = today;
}
if (document.getElementById('report-date-filter')) {
    document.getElementById('report-date-filter').value = today;
}

window.onload = () => {
    showView('auth-section');
    document.getElementById('nav-links').classList.add('hidden');

    window.onAuthStateChanged(window.auth, (user) => {
        if (user) {
            const userRef = window.dbRef(window.db, `users/${user.uid}`);
            window.dbGet(userRef).then((snapshot) => {
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    currentUser = {
                        uid: user.uid,
                        email: userData.email,
                        name: userData.name,
                        phone: userData.phone,
                        role: userData.role
                    };

                    localStorage.setItem('plume_user', JSON.stringify(currentUser));

                    document.getElementById('nav-links').classList.remove('hidden');

                    if (currentUser.role === 'admin') {
                        showView('admin-section');
                        startFirebaseSync();
                        startNotificationChecker();
                        requestNotificationPermission();
                    } else if (currentUser.role === 'specialist') {
                        showView('specialist-section');
                        startFirebaseSync();
                        startNotificationChecker();
                        requestNotificationPermission();
                    } else if (currentUser.role === 'client') {
                        showView('booking-section');
                        startFirebaseSync();
                        startNotificationChecker();
                    } else {
                        console.error("Unknown user role:", currentUser.role);
                        window.signOut(window.auth);
                    }
                } else {
                    console.error("User data not found in database");
                    showNotification('Account data not found. Please contact support.', 'danger');
                    window.signOut(window.auth);
                }
            }).catch(error => {
                console.error("Error fetching user data:", error);
                showNotification('Error loading account data', 'danger');
                window.signOut(window.auth);
            });

        } else {
            currentUser = null;
            localStorage.removeItem('plume_user');
            document.getElementById('nav-links').classList.add('hidden');
            showView('auth-section');

            isLoggingIn = true;
            if (document.getElementById('signup-extra')) {
                document.getElementById('signup-extra').classList.add('hidden');
            }
            if (authBtn) {
                authBtn.innerHTML = '<span>Login</span><i class="fas fa-arrow-right"></i>';
            }
            if (document.getElementById('auth-title')) {
                document.getElementById('auth-title').innerText = 'Welcome Back';
            }
        }
    });
};


