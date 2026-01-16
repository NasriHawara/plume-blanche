// ==========================================
// SALON MANAGEMENT SYSTEM - COMPLETE VERSION
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

    // Sync technicians - now includes user linking
    const techRef = window.dbRef(window.db, 'technicians');
    window.dbOnValue(techRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            technicians = Object.keys(data).map(key => ({
                ...data[key],
                id: key
            }));
            
            // If user is a specialist, filter to show only their data
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
                // Specialist sees only themselves in dropdowns
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
            // Convert to array with keys
            const notifications = Object.keys(data).map(key => ({
                ...data[key],
                key: key
            }));
            
            // Check for new notifications if user is admin or specialist
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
                checkForNewNotifications(notifications);
            }
        }
    });

    // NEW: Sync users for admin to see all accounts
    if (currentUser && currentUser.role === 'admin') {
        const usersRef = window.dbRef(window.db, 'users');
        window.dbOnValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Store users data for admin reference
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

    // Update navigation visibility
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
            // LOGIN EXISTING USER
            const userCredential = await window.signInWithEmailAndPassword(window.auth, email, password);
            console.log("User logged in:", userCredential.user.uid);
            showNotification('Login successful!', 'success');
            
        } else {
            // SIGNUP NEW USER - ALWAYS AS CLIENT
            const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
            console.log("User created:", userCredential.user.uid);
            
            // Save user data to Firebase - ALWAYS AS CLIENT
            const userData = {
                email: email,
                name: name,
                phone: phone,
                role: 'client', // ALWAYS client on signup
                createdAt: new Date().toISOString()
            };
            
            const userRef = window.dbRef(window.db, `users/${userCredential.user.uid}`);
            await window.dbSet(userRef, userData);
            console.log("Client account created");
            
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
            // Auth state listener will handle the UI update
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

    // Get selected date to check laser availability
    const selectedDate = datePicker?.value;
    const isLaserEnabled = selectedDate && laserDates.includes(selectedDate);

    // Group services by category
    const categories = {};
    services.forEach(service => {
        // Check if this is a laser service
        const isLaserService = service.category && service.category.toLowerCase() === 'laser';
        
        // Skip laser services if not enabled for this date (unless admin)
        if (isLaserService) {
            if (!isLaserEnabled && currentUser && currentUser.role !== 'admin') {
                return; // Skip laser services for non-admins when not enabled
            }
            // Only show laser services if date is enabled OR user is admin
            if (!isLaserEnabled && currentUser && currentUser.role !== 'admin') {
                return;
            }
        }

        let catName = service.category || "General Services";
        // Make sure "Laser" is always categorized as "Laser" (case-sensitive for filtering)
        if (isLaserService) {
            catName = "Laser";
        }
        
        if (!categories[catName]) categories[catName] = [];
        categories[catName].push(service);
    });

    // If no services available (especially for laser), show message
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
        
        // Add laser indicator if this is the Laser category
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

            // Add laser icon for laser services
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

        // Update technician dropdown based on selected services
        updateTechnicianOptions();
    } else {
        bookingSummary.classList.add('hidden');
        timeGrid.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted);">Select services to see available times</p>';
        bookNowBtn.classList.add('hidden');
    }
}

function updateTechnicianOptions() {
    if (!techSelect) return;

    // 1. Get IDs of all currently checked services
    const checked = Array.from(serviceCheckboxList.querySelectorAll('input:checked'));
    const selectedServiceIds = checked.map(el => el.value);

    // 2. Filter based on User Role (Specialists only see themselves)
    let availableTechs = technicians;
    if (currentUser && currentUser.role === 'specialist') {
        availableTechs = technicians.filter(tech => 
            tech.userId === currentUser.uid
        );
    }

    // 3. Filter by Skills (The Fix)
    const qualifiedTechs = availableTechs.filter(tech => {
        // If no services are selected yet, show everyone
        if (selectedServiceIds.length === 0) return true;

        // If a technician has no skills listed, they are not qualified for any selected service
        if (!tech.skills || !Array.isArray(tech.skills) || tech.skills.length === 0) {
            return false;
        }

        // Only return true if the tech has EVERY selected service ID in their skills array
        return selectedServiceIds.every(sId => tech.skills.includes(sId));
    });

    // 4. Update the Dropdown HTML
    renderTechDropdown(qualifiedTechs);
}

// Helper function to handle the actual drawing of the dropdown
function renderTechDropdown(techList) {
    const currentSelection = techSelect.value;
    
    techSelect.innerHTML = '<option value="" disabled selected>Select your preferred specialist...</option>';
    
    techList.forEach(t => {
        const selected = (t.name === currentSelection) ? 'selected' : '';
        techSelect.innerHTML += `<option value="${t.name}" ${selected}>${t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>`;
    });
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

    // Check if date is Sunday and user is not admin
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
    // Check if user is authenticated as client
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Please login as a client to book appointments', 'warning');
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
    
    // Get selected specialist
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
        userId: currentUser.uid, // Client's user ID
        specialistId: selectedSpecialist.userId || "", // Specialist's user ID
        services: selectedServiceNames,
        serviceIds: selectedServiceIds,
        tech: selectedSpecialistName,
        time: selectedSlot.innerText,
        duration: totalDuration,
        price: totalPrice,
        date: datePicker.value,
        status: needsApproval ? 'pending' : 'confirmed', // Admin no longer auto-confirms
        createdAt: new Date().toISOString()
    };

    const appointmentsRef = window.dbRef(window.db, 'appointments');
    const newApptRef = window.dbPush(appointmentsRef);

    try {
        await window.dbSet(newApptRef, newBooking);
        console.log("Booking synced to Firebase!");

        // Play notification sound for everyone
        playNotificationSound('booking');

        // Send booking notification to admin and specialist
        sendBookingNotification(newBooking);

        document.getElementById('modal-msg').innerText = newBooking.status === 'pending'
            ? "Your request has been sent! Awaiting confirmation."
            : "Your appointment has been confirmed successfully!";
        confirmModal.classList.add('active');

        // Reset form
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
    
    // Update tab active state
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
        appt.email === currentUser.email || appt.phone === currentUser.phone
    );

    // Filter based on current filter
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

    // Sort by date and time
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
    // Check if user is a specialist
    if (!container || !currentUser || currentUser.role !== 'specialist') return;

    const filterDate = document.getElementById('specialist-date-filter')?.value || new Date().toISOString().split('T')[0];
    
    // Get ONLY this specialist's appointments (using specialistId or tech name match)
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

// Setup specialist date filter
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
}

function renderAdminInbox() {
    let inbox = document.getElementById('admin-inbox');
    if (!inbox) return;

    const pending = mockAppointments.filter(a => a.status === 'pending');

    // Update badge
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

function renderAdminScheduler() {
    const grid = document.getElementById('scheduler-grid');
    if (!grid) return;

    const dateVal = document.getElementById('admin-date-filter')?.value || "";
    const techVal = document.getElementById('admin-tech-filter')?.value || "all";
    const serviceVal = document.getElementById('admin-service-filter')?.value || "all";

    // Show loading while technicians are being fetched
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
            cell.onclick = () => quickAddAppointment(tech.name, dateVal, timeStr);
            grid.appendChild(cell);
        });
    }

    mockAppointments.forEach(appt => {
        if (appt.status !== 'confirmed') return;

        const matchesDate = !dateVal || appt.date === dateVal;
        const matchesTech = techVal === 'all' || appt.tech === techVal;
        const matchesService = serviceVal === 'all' || appt.services.includes(serviceVal);

        if (matchesDate && matchesTech && matchesService) {
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

function quickAddAppointment(tech, date, time) {
    showView('booking-section');

    const tSelect = document.getElementById('tech-select');
    const dPicker = document.getElementById('date-picker');
    const dForm = document.getElementById('details-form');

    if (tSelect) tSelect.value = tech;

    if (dPicker) {
        const finalDate = date || new Date().toISOString().split('T')[0];
        dPicker.value = finalDate;
        if (dForm) dForm.classList.remove('hidden');
    }

    renderServiceCheckboxes();
    updateBookingTotal();

    setTimeout(() => {
        const slots = document.querySelectorAll('.time-slot');
        slots.forEach(slot => {
            if (slot.innerText.trim() === time.trim()) {
                selectSlot(slot);
                slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }, 400);
}

// ==========================================
// LASER MANAGEMENT
// ==========================================
function toggleLaserForDate() {
    const selectedDate = document.getElementById('admin-date-filter')?.value;
    
    if (!selectedDate) {
        showNotification('Please select a date first', 'warning');
        return;
    }

    const laserRef = window.dbRef(window.db, 'laserDates');
    
    if (laserDates.includes(selectedDate)) {
        // Disable laser for this date
        const index = laserDates.indexOf(selectedDate);
        laserDates.splice(index, 1);
    } else {
        // Enable laser for this date
        laserDates.push(selectedDate);
    }

    window.dbSet(laserRef, laserDates).then(() => {
        showNotification(
            laserDates.includes(selectedDate) ? 'Laser services enabled for this date' : 'Laser services disabled for this date',
            'success'
        );
        updateLaserButton();
    });
}

function updateLaserButton() {
    const selectedDate = document.getElementById('admin-date-filter')?.value;
    const btn = document.getElementById('toggle-laser-btn');
    const statusText = document.getElementById('laser-status-text');
    
    if (!btn || !statusText) return;

    if (selectedDate && laserDates.includes(selectedDate)) {
        btn.classList.add('active');
        statusText.textContent = 'Laser Enabled ✓';
    } else {
        btn.classList.remove('active');
        statusText.textContent = 'Enable Laser for Selected Date';
    }
}

// ==========================================
// BUSINESS MANAGEMENT
// ==========================================
function renderStaffList() {
    const container = document.getElementById('staff-list-container');
    if (!container) return;
    
    container.innerHTML = technicians.map(t => `
        <div class="mgmt-item">
            <div>
                <span><i class="fas fa-user"></i> ${t.displayName || t.name.toUpperCase()}</span>
                ${t.email ? `<br><small>${t.email}</small>` : ''}
                ${t.phone ? `<br><small style="color: var(--text-muted);">${t.phone}</small>` : ''}
                ${t.userId ? `<br><small style="color: var(--primary-tan); font-size: 0.7rem;">User ID: ${t.userId.substring(0, 8)}...</small>` : ''}
                ${t.skills && t.skills.length > 0 ? `<br><small style="color: var(--success);">${t.skills.length} skills assigned</small>` : ''}
                ${!t.userId ? `<br><small style="color: var(--warning); font-size: 0.7rem;"><i class="fas fa-exclamation-triangle"></i> No linked user account</small>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="openSkillsModal('${t.id}')" class="btn-skills" title="Manage Skills">
                    <i class="fas fa-cog"></i>
                </button>
                ${t.userId ? `
                    <button onclick="resetUserPassword('${t.userId}', '${t.email || t.name}')" class="btn-secondary-small" title="Reset Password">
                        <i class="fas fa-key"></i>
                    </button>
                ` : ''}
                ${t.userId ? `
                    <button onclick="viewUserDetails('${t.userId}')" class="btn-info-small" title="View Account Details">
                        <i class="fas fa-info-circle"></i>
                    </button>
                ` : ''}
                <button onclick="removeStaff('${t.id}')" class="btn-delete-small">Delete</button>
            </div>
        </div>
    `).join('');
}

// Add these helper functions:

async function resetUserPassword(userId, userName) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'danger');
        return;
    }
    
    // Generate new password
    const newPassword = generatePassword(8);
    
    // Note: In production, you'd use Firebase Admin SDK via Cloud Function
    // For now, just show the new password to admin
    showNotification(
        `New password for ${userName}: ${newPassword}`,
        'success',
        10000 // Show for 10 seconds
    );
    
    console.log(`Reset password for user ${userId} (${userName}): ${newPassword}`);
}

function viewUserDetails(userId) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'danger');
        return;
    }
    
    // Get user details from Firebase
    const userRef = window.dbRef(window.db, `users/${userId}`);
    window.dbGet(userRef).then((snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            const details = `
                <strong>Account Details:</strong><br>
                Name: ${userData.name}<br>
                Email: ${userData.email}<br>
                Role: ${userData.role}<br>
                Phone: ${userData.phone || 'N/A'}<br>
                Created: ${new Date(userData.createdAt).toLocaleDateString()}<br>
                User ID: ${userId}
            `;
            
            // Show in modal or alert
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
                <div class="modal-content" style="max-width: 500px;">
                    <h3><i class="fas fa-user-circle"></i> User Account Details</h3>
                    <div style="text-align: left; padding: 20px; background: var(--light-bg); border-radius: 10px; margin: 20px 0;">
                        ${details}
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" class="btn-primary">
                        <span>Close</span>
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }
    });
}

function renderServiceList() {
    const container = document.getElementById('service-list-container');
    if (!container) return;
    
    container.innerHTML = services.map(s => `
        <div class="mgmt-item">
            <span>
                <i class="fas fa-cut"></i> ${s.name} 
                <small>(${s.duration}m, $${s.price})</small>
                ${s.requiresConfirmation ? '<span class="badge-confirm">Needs Approval</span>' : ''}
            </span>
            <button onclick="removeService('${s.id}')" class="btn-delete-small">Delete</button>
        </div>
    `).join('');
}

async function addStaff() {
    // Check if user is admin
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'danger');
        return;
    }
    
    const nameInput = document.getElementById('new-staff-name');
    const phoneInput = document.getElementById('new-staff-phone');
    const emailInput = document.getElementById('new-staff-email'); // NEW: Add this input
    const roleSelect = document.getElementById('new-staff-role'); // NEW: Add this select
    
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput?.value.trim().toLowerCase() || "";
    const role = roleSelect?.value || "specialist";
    
    if (!name) {
        showNotification('Please enter a name', 'warning');
        return;
    }
    
    if (!email) {
        showNotification('Please enter an email address', 'warning');
        return;
    }
    
    if (!validateEmail(email)) {
        showNotification('Please enter a valid email address', 'warning');
        return;
    }

    try {
        // Generate a secure random password (8 characters)
        console.log("✅ STEP 1: Starting addStaff process");
        const tempPassword = generatePassword(8);
        
        // 1. Create Firebase Auth account
        const userCredential = await window.createUserWithEmailAndPassword(
            window.auth, 
            email, 
            tempPassword
        );
        
        const userId = userCredential.user.uid;
        console.log("✅ STEP 2: Auth created, userId:", userId);
        console.log(`Auth account created for ${email} with ID: ${userId}`);
        
        // 2. Save user data to users collection
        const userData = {
            email: email,
            name: name,
            phone: phone,
            role: role,
            tempPassword: tempPassword, // Store temporarily for admin to see
            createdAt: new Date().toISOString(),
            createdBy: currentUser.uid
        };
        
        const userRef = window.dbRef(window.db, `users/${userId}`);
        console.log("✅ STEP 3: User data saved to /users/", userId);
        await window.dbSet(userRef, userData);
        
        // 3. If specialist, add to technicians collection
        if (role === 'specialist') {
            console.log("✅ STEP 4: Adding as specialist");
            const newStaff = {
                name: name.toLowerCase(),
                displayName: name,
                phone: phone,
                email: email,
                userId: userId, // Link to user account
                skills: [],
                createdAt: new Date().toISOString()
            };

            const techRef = window.dbRef(window.db, 'technicians');
            const newTechRef = window.dbPush(techRef);
                    console.log("DEBUG: About to write to technicians");
                    console.log("techRef path:", techRef.toString());
                    console.log("newStaff data:", newStaff);
            await window.dbSet(newTechRef, newStaff);
        }
        
        // 4. Clear form and show success
        nameInput.value = '';
        phoneInput.value = '';
        if (emailInput) emailInput.value = '';
        if (roleSelect) roleSelect.value = 'specialist';
        
        // 5. Show success with password info
        showNotification(
            `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully! ` +
            `Temporary password: ${tempPassword}`,
            'success'
        );
        
        // 6. Log to console for admin reference
        console.log(`Account created for ${name} (${role})`);
        console.log(`Email: ${email}`);
        console.log(`Temporary password: ${tempPassword}`);
        console.log(`User ID: ${userId}`);
        
    } catch (error) {
        console.error("Error creating staff account:", error);
        let message = 'Failed to create staff account. ';
        if (error.code === 'auth/email-already-in-use') {
            message = 'Email already in use. ';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Invalid email address. ';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password is too weak. ';
        }
        showNotification(message + error.message, 'danger');
    }
}

async function removeStaff(id) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'danger');
        return;
    }
    
    if (!confirm('Remove this team member? This will delete their technician entry but NOT their user account.')) return;

    const techRef = window.dbRef(window.db, `technicians/${id}`);
    
    try {
        await window.dbRemove(techRef);
        showNotification('Team member removed from technicians list', 'info');
    } catch (error) {
        console.error(error);
        showNotification('Failed to remove team member', 'danger');
    }
}

// Helper function to generate random password
function generatePassword(length = 8) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

// Helper function to validate email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Function to delete user account completely (admin only)
async function deleteUserAccount(userId) {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'danger');
        return;
    }
    
    if (!confirm('WARNING: This will permanently delete the user account, including all their data. Continue?')) return;
    
    try {
        // Note: In production, you'd need a Cloud Function to delete Auth account
        // For now, just remove from database
        const userRef = window.dbRef(window.db, `users/${userId}`);
        await window.dbRemove(userRef);
        
        // Also remove from technicians if they were a specialist
        const techsRef = window.dbRef(window.db, 'technicians');
        const techsSnapshot = await window.dbGet(techsRef);
        if (techsSnapshot.exists()) {
            const techs = techsSnapshot.val();
            for (const [techId, tech] of Object.entries(techs)) {
                if (tech.userId === userId) {
                    const techRef = window.dbRef(window.db, `technicians/${techId}`);
                    await window.dbRemove(techRef);
                }
            }
        }
        
        showNotification('User account deleted successfully', 'success');
    } catch (error) {
        console.error("Error deleting user account:", error);
        showNotification('Failed to delete user account', 'danger');
    }
}

async function addService() {
    const nameInput = document.getElementById('new-service-name');
    const durInput = document.getElementById('new-service-dur');
    const priceInput = document.getElementById('new-service-price');
    const confirmCheckbox = document.getElementById('new-service-confirm');
    const categoryInput = document.getElementById('new-service-category');

    const name = nameInput.value.trim();
    const duration = parseInt(durInput.value);
    const price = parseInt(priceInput.value);
    const requiresConfirmation = confirmCheckbox.checked;
    const category = categoryInput.value.trim() || "Other";

    if (!name || !duration || isNaN(duration) || duration <= 0 || isNaN(price) || price < 0) {
        showNotification('Please fill in name, duration (positive number), and price (non-negative number)', 'warning');
        return;
    }

    const newSrv = {
        name: name,
        duration: duration,
        price: price,
        requiresConfirmation: requiresConfirmation,
        category: category
    };

    const servicesRef = window.dbRef(window.db, 'services');
    const newServiceRef = window.dbPush(servicesRef);

    try {
        await window.dbSet(newServiceRef, newSrv);
        nameInput.value = '';
        durInput.value = '';
        priceInput.value = '';
        confirmCheckbox.checked = false;
        categoryInput.value = '';
        showNotification('Service added successfully!', 'success');
    } catch (error) {
        console.error(error);
        showNotification('Failed to add service', 'danger');
    }
}

async function removeService(id) {
    if (!confirm("Delete this service?")) return;

    const serviceRef = window.dbRef(window.db, `services/${id}`);
    
    try {
        await window.dbRemove(serviceRef);
        showNotification('Service removed', 'info');
    } catch (error) {
        console.error(error);
        showNotification('Failed to remove service', 'danger');
    }
}

// ==========================================
// STAFF SKILLS MANAGEMENT
// ==========================================
function openSkillsModal(staffId) {
    currentEditingStaff = staffId;
    const staff = technicians.find(t => t.id === staffId);
    
    if (!staff) return;

    document.getElementById('skills-modal-title').textContent = `Manage Skills for ${staff.name.toUpperCase()}`;
    
    const container = document.getElementById('skills-checkbox-list');
    container.innerHTML = '';

    services.forEach(service => {
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        
        const isAssigned = staff.skills && staff.skills.includes(service.id);
        
        item.innerHTML = `
            <input type="checkbox" value="${service.id}" ${isAssigned ? 'checked' : ''}>
            <span>${service.name}</span>
        `;
        
        container.appendChild(item);
    });

    document.getElementById('skills-modal').classList.add('active');
}

function closeSkillsModal() {
    document.getElementById('skills-modal').classList.remove('active');
    currentEditingStaff = null;
}

async function saveStaffSkills() {
    if (!currentEditingStaff) return;

    const checked = Array.from(document.querySelectorAll('#skills-checkbox-list input:checked'));
    const skillIds = checked.map(cb => cb.value);

    const techRef = window.dbRef(window.db, `technicians/${currentEditingStaff}`);
    
    try {
        await window.dbUpdate(techRef, { skills: skillIds });
        showNotification('Skills updated successfully!', 'success');
        closeSkillsModal();
    } catch (error) {
        console.error(error);
        showNotification('Failed to update skills', 'danger');
    }
}

// ==========================================
// APPOINTMENT MANAGEMENT
// ==========================================
async function confirmBooking(fbId) {
    const apptRef = window.dbRef(window.db, `appointments/${fbId}`);

    try {
        await window.dbUpdate(apptRef, { status: 'confirmed' });
        showNotification('Appointment confirmed!', 'success');
        
        // Also send notification about the confirmation
        const appointment = mockAppointments.find(a => a.firebaseId === fbId);
        if (appointment) {
            sendBookingNotification({
                ...appointment,
                type: 'booking_confirmed',
                title: '✅ Booking Confirmed'
            });
        }
    } catch (err) {
        console.error("Error confirming:", err);
        showNotification('Failed to confirm appointment', 'danger');
    }
}

async function deleteAppointment(firebaseId) {
    if (!confirm("Cancel this appointment?")) return;

    const apptRef = window.dbRef(window.db, `appointments/${firebaseId}`);

    try {
        await window.dbRemove(apptRef);
        showNotification('Appointment cancelled', 'info');
    } catch (error) {
        console.error("Delete failed:", error);
        showNotification('Failed to cancel appointment', 'danger');
    }
}

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================
let userInteracted = false;
document.addEventListener('click', () => {
    userInteracted = true;
}, { once: true });

function playNotificationSound(type = 'booking') {
    // Don't play sound until user has interacted with the page
    if (!userInteracted) return;
    
    try {
        // First try Web Audio API (works offline and doesn't need network)
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different frequencies for different notification types
            let frequency = 600; // Default
            if (type === 'alert') frequency = 800;
            if (type === 'success') frequency = 700;
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            return; // Success - don't try external sounds
        } catch (e) {
            // Web Audio API failed, continue to external sounds
        }
        
        // Only try external sounds if we're online
        if (navigator.onLine) {
            const audio = new Audio();
            
            // Different sounds for different notification types
            switch(type) {
                case 'booking':
                    audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3';
                    break;
                case 'alert':
                    audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-warning-alarm-buzzer-711.mp3';
                    break;
                case 'success':
                    audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-achievement-bell-600.mp3';
                    break;
                default:
                    audio.src = 'https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3';
            }
            
            audio.volume = 0.4;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    // Silent fail - don't log errors
                });
            }
        }
    } catch (e) {
        // Silent fail
    }
}

function sendBookingNotification(booking) {
    // Create a notification object
    const notification = {
        type: 'new_booking',
        title: booking.status === 'pending' ? '📋 New Booking Request' : '✅ New Booking Confirmed',
        message: `${booking.name} booked ${booking.services.join(', ')} with ${booking.tech}`,
        details: {
            client: booking.name,
            services: booking.services,
            specialist: booking.tech,
            date: booking.date,
            time: booking.time,
            status: booking.status
        },
        timestamp: new Date().toISOString(),
        read: false,
        forAdmin: true,
        forSpecialist: booking.tech
    };

    // Save to Firebase
    const notificationsRef = window.dbRef(window.db, 'notifications');
    const newNotificationRef = window.dbPush(notificationsRef);
    
    // Save the notification with its key
    const notificationWithKey = {
        ...notification,
        key: newNotificationRef.key
    };
    
    window.dbSet(newNotificationRef, notification).then(() => {
        console.log("Booking notification saved to Firebase");
        
        // Also show immediate on-screen notification if user is logged in as admin or the assigned specialist
        if (currentUser && (currentUser.role === 'admin' || currentUser.name === booking.tech)) {
            showPersistentNotification(notificationWithKey);
        }
    }).catch(error => {
        console.error("Failed to save notification:", error);
    });
}

function showPersistentNotification(notification) {
    // Check if this notification is already displayed
    const notificationId = `notification-${notification.key || notification.timestamp}`;
    if (document.getElementById(notificationId)) {
        return; // Already showing
    }
    
    // Create a persistent notification that stays until closed
    const notificationEl = document.createElement('div');
    notificationEl.id = notificationId;
    notificationEl.className = 'immediate-notification persistent';
    notificationEl.innerHTML = `
        <div class="notification-header">
            <i class="fas fa-bell"></i>
            <strong>${notification.title}</strong>
            <button class="close-notification" onclick="removeNotification('${notificationId}')">×</button>
        </div>
        <div class="notification-body">
            ${notification.message}
            <div style="font-size:0.85rem; margin-top:8px; color:var(--text-muted);">
                <i class="fas fa-clock"></i> ${new Date(notification.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
        </div>
    `;
    
    document.body.appendChild(notificationEl);
    
    // Play sound for this notification
    playNotificationSound('alert');
    
    // Update badge count
    updateNotificationBadgeFromDOM();
}

function removeNotification(id) {
    const notification = document.getElementById(id);
    if (notification) {
        notification.remove();
        // Mark as read in Firebase if it has a key
        const notificationKey = id.replace('notification-', '');
        markNotificationAsRead(notificationKey);
    }
    // Update badge count when notification is closed
    updateNotificationBadgeFromDOM();
}

function updateNotificationBadgeFromDOM() {
    const notifications = document.querySelectorAll('.persistent').length;
    updateNotificationBadge(notifications);
}

async function markNotificationAsRead(notificationKey) {
    if (!notificationKey) return;
    
    const notificationRef = window.dbRef(window.db, `notifications/${notificationKey}`);
    try {
        await window.dbUpdate(notificationRef, { read: true });
    } catch (error) {
        console.error("Failed to mark notification as read:", error);
    }
}

function startNotificationChecker() {
    // Check for new notifications every 60 seconds (instead of 30)
    setInterval(() => {
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
            checkForNewNotificationsFromFirebase();
        }
    }, 60000); // 60 seconds
    
    // Also check immediately when page loads
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'specialist')) {
        setTimeout(checkForNewNotificationsFromFirebase, 2000);
    }
}

function checkForNewNotificationsFromFirebase() {
    const notificationsRef = window.dbRef(window.db, 'notifications');
    window.dbGet(notificationsRef).then((snapshot) => {
        if (snapshot.exists()) {
            // Convert to array with keys
            const data = snapshot.val();
            const notifications = Object.keys(data).map(key => ({
                ...data[key],
                key: key
            }));
            checkForNewNotifications(notifications);
        }
    });
}

function checkForNewNotifications(notifications) {
    if (!currentUser) return;
    
    // Filter for unread notifications for this user
    const userNotifications = notifications.filter(notif => 
        !notif.read && (
            (notif.forAdmin && currentUser.role === 'admin') ||
            (notif.forSpecialist === currentUser.name)
        )
    );
    
    // Show all unread notifications (not just the latest)
    userNotifications.forEach(notification => {
        showPersistentNotification(notification);
    });
    
    // Update badge count
    updateNotificationBadgeFromDOM();
}

function updateNotificationBadge(count) {
    // Update badge in admin/specialist view
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    }
    
    // Or create a badge if it doesn't exist
    if (count > 0 && !document.getElementById('notification-badge')) {
        const bellIcon = document.querySelector('.fa-bell');
        if (bellIcon && bellIcon.parentElement) {
            const badge = document.createElement('span');
            badge.id = 'notification-badge';
            badge.className = 'notification-dot';
            badge.textContent = count;
            badge.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                background: var(--danger);
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                font-size: 0.7rem;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid white;
            `;
            bellIcon.parentElement.style.position = 'relative';
            bellIcon.parentElement.appendChild(badge);
        }
    }
}

// ==========================================
// UTILITIES
// ==========================================
function timeToMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function formatMinsToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${m === 0 ? '00' : m < 10 ? '0' + m : m}`;
}

function updateClientDropdowns(selectedServiceId) {
    if (!techSelect) return;
    
    // 1. Clear the current list
    techSelect.innerHTML = '<option value="" disabled selected>Select your preferred specialist...</option>';
    
    // 2. Filter the technicians based on the selected service
    const availableTechs = technicians.filter(t => {
        // If no service is selected yet, maybe show none or all (your choice)
        if (!selectedServiceId) return true; 
        
        // Check if the technician has the selected service ID in their skills array
        return t.skills && t.skills.includes(selectedServiceId);
    });

    // 3. Only add the ones who have the skill
    availableTechs.forEach(t => {
        techSelect.innerHTML += `<option value="${t.name}">${t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>`;
    });
}

function updateAdminFilterDropdowns() {
    const adminTechSelect = document.getElementById('admin-tech-filter');
    const adminServiceSelect = document.getElementById('admin-service-filter');

    if (adminTechSelect) {
        adminTechSelect.innerHTML = '<option value="all">All Specialists</option>';
        technicians.forEach(t => {
            adminTechSelect.innerHTML += `<option value="${t.name}">${t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>`;
        });
    }

    if (adminServiceSelect) {
        adminServiceSelect.innerHTML = '<option value="all">All Services</option>';
        services.forEach(s => {
            adminServiceSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
        });
    }
}

function closeModal() {
    confirmModal.classList.remove('active');
    showView('client-profile-section');
}

function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(tabId).classList.remove('hidden');
    event.currentTarget.classList.add('active');

    if (tabId === 'tab-scheduler') renderAdminScheduler();
    if (tabId === 'tab-inbox') renderAdminInbox();
}

function switchView(viewType) {
    const dailyContainer = document.querySelector('.scheduler-container');
    const weeklyContainer = document.getElementById('weekly-summary-container');

    if (!dailyContainer || !weeklyContainer) return;

    const btnDaily = document.getElementById('btn-daily');
    const btnWeekly = document.getElementById('btn-weekly');

    if (viewType === 'weekly') {
        dailyContainer.classList.add('hidden');
        weeklyContainer.classList.remove('hidden');
        btnWeekly?.classList.add('active');
        btnDaily?.classList.remove('active');
        renderWeeklyCalendar();
    } else {
        weeklyContainer.classList.add('hidden');
        dailyContainer.classList.remove('hidden');
        btnDaily?.classList.add('active');
        btnWeekly?.classList.remove('active');
        renderAdminScheduler();
    }
}

function renderWeeklyCalendar() {
    const container = document.getElementById('weekly-summary-container');
    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 30px;">
            <button onclick="changeWeek(-1)" class="btn-view-toggle"><i class="fas fa-chevron-left"></i> Previous</button>
            <h3 style="font-family: 'Playfair Display'; min-width: 200px; text-align: center;">Week Overview</h3>
            <button onclick="changeWeek(1)" class="btn-view-toggle">Next <i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="weekly-preview-grid"></div>
    `;

    const grid = container.querySelector('.weekly-preview-grid');
    const today = new Date();
    today.setDate(today.getDate() + (weeklyViewOffset * 7));

    for (let i = 0; i < 7; i++) {
        let d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayAppts = mockAppointments.filter(a => a.date === dateStr && a.status === 'confirmed');

        const card = document.createElement('div');
        card.className = 'day-preview-card';

        let bgColor = dayAppts.length === 0 ? '#f5f5f5' :
                      dayAppts.length <= 2 ? '#ebfbee' :
                      dayAppts.length <= 5 ? '#fff4e6' : '#fff0f3';

        card.style.background = bgColor;

        card.innerHTML = `
            <h4 style="font-family: 'Playfair Display'; font-size:1.3rem; margin-bottom:12px;">
                ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
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
// NOTIFICATIONS (ORIGINAL FUNCTIONS)
// ==========================================
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
// INITIALIZATION
// ==========================================
datePicker?.addEventListener('change', () => {
    if (datePicker.value) {
        detailsForm.classList.remove('hidden');
        renderServiceCheckboxes(); // Re-render to check laser availability
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

// Set min date for date pickers to today
const today = new Date().toISOString().split('T')[0];
if (datePicker) {
    datePicker.min = today;
    datePicker.value = today;
}
if (document.getElementById('admin-date-filter')) {
    document.getElementById('admin-date-filter').value = today;
}

window.onload = () => {
    // Always show login page first
    showView('auth-section');
    document.getElementById('nav-links').classList.add('hidden');
    
    // Check auth state using Firebase Auth
    window.onAuthStateChanged(window.auth, (user) => {
        if (user) {
            // User is signed in - get their data from Firebase
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
                    
                    // Show navigation
                    document.getElementById('nav-links').classList.remove('hidden');
                    
                    // Show appropriate view based on role
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
                        startNotificationChecker(); // Clients also check for their own notifications
                    } else {
                        // Unknown role - logout
                        console.error("Unknown user role:", currentUser.role);
                        window.signOut(window.auth);
                    }
                } else {
                    // User data not found in database - logout
                    console.error("User data not found in database");
                    showNotification('Account data not found. Please contact support.', 'danger');
                    
                }
            }).catch(error => {
                console.error("Error fetching user data:", error);
                showNotification('Error loading account data', 'danger');
                window.signOut(window.auth);
            });
            
        } else {
            // No user signed in - show login page
            currentUser = null;
            localStorage.removeItem('plume_user');
            document.getElementById('nav-links').classList.add('hidden');
            showView('auth-section');
            
            // Reset auth form to login mode
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

// Add animation CSS
const style = document.createElement('style');
style.textContent = `
@keyframes slideInRight {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
}
@keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}
@keyframes slideInNotification {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
.badge {
    background: var(--danger);
    color: white;
    border-radius: 50%;
    padding: 2px 8px;
    font-size: 0.7rem;
    margin-left: 8px;
    font-weight: 700;
}
.badge-confirm {
    background: var(--warning);
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.7rem;
    margin-left: 8px;
    font-weight: 600;
}
.btn-skills {
    background: var(--primary-tan);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s;
}
.btn-skills:hover {
    background: var(--primary-dark);
    transform: scale(1.05);
}
.laser-panel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: rgba(255, 193, 7, 0.1);
    border: 2px solid rgba(255, 193, 7, 0.3);
    border-radius: 14px;
    margin: 20px 0;
}
.laser-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
    color: var(--text-dark);
}
.laser-info i {
    color: #ff9800;
    font-size: 1.3rem;
}
.btn-laser {
    background: #ff9800;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 25px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 0.85rem;
}
.btn-laser:hover {
    background: #f57c00;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
}
.btn-laser.active {
    background: var(--success);
}
.btn-laser.active:hover {
    background: #5da876;
}
.weekly-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 20px;
}
.day-preview-card {
    padding: 25px;
    border-radius: 18px;
    box-shadow: 0 4px 16px var(--shadow-soft);
    transition: all 0.3s;
    border: 2px solid rgba(188, 148, 127, 0.2);
}
.day-preview-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 24px var(--shadow-medium);
}
.first-appt-badge {
    background: var(--gradient-soft);
    padding: 10px;
    border-radius: 10px;
    margin: 12px 0;
    font-weight: 600;
    color: var(--primary-dark);
    border: 2px solid rgba(188, 148, 127, 0.2);
}
.preview-list {
    margin: 15px 0;
}
.preview-item {
    padding: 8px;
    color: var(--text-dark);
    font-size: 0.9rem;
}
.specialist-day-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid rgba(188, 148, 127, 0.2);
}
.specialist-stats {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 15px;
}
.stat-badge {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: var(--gradient-soft);
    border-radius: 20px;
    border: 2px solid rgba(188, 148, 127, 0.2);
    font-weight: 600;
    color: var(--primary-dark);
}
.specialist-filters {
    margin-bottom: 25px;
}
.calendar-container {
    margin-top: 20px;
}
/* Immediate Notification Styling */
.immediate-notification {
    position: fixed;
    top: 100px;
    right: 20px;
    background: white;
    border-left: 5px solid var(--primary-tan);
    border-radius: 10px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.15);
    z-index: 9999;
    max-width: 350px;
    animation: slideInNotification 0.5s ease;
    overflow: hidden;
}
.notification-header {
    background: var(--gradient-soft);
    padding: 12px 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--primary-dark);
    font-weight: 600;
}
.notification-header i {
    color: var(--primary-tan);
}
.close-notification {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
}
.close-notification:hover {
    background: rgba(0,0,0,0.1);
}
.notification-body {
    padding: 15px;
    color: var(--text-dark);
    line-height: 1.5;
}
`;
document.head.appendChild(style);

