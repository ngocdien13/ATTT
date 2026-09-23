const loginSection = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");
const userInfo = document.getElementById("userInfo");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");

const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");

const username = document.getElementById("username");
const userEmail = document.getElementById("userEmail");

const findUserForm = document.getElementById("findUserForm");
const userId = document.getElementById("userId");

const findUserMessage = document.getElementById("findUserMessage");

const foundUser = document.getElementById("foundUser");
const foundUsername = document.getElementById("foundUsername");
const foundUserId = document.getElementById("foundUserId");

const currentUserId = document.getElementById("currentUserId");
const copyUserId = document.getElementById("copyUserId");
const copyMessage = document.getElementById("copyMessage");
const friendRequests =
    document.getElementById("friendRequests");
const friendsList =
    document.getElementById("friendsList");


async function loadFriendRequests() {
    const response = await fetch("/api/friendships/requests");

    if (!response.ok) {
        return;
    }

    const data = await response.json();

    friendRequests.innerHTML = "";

    data.requests.forEach((request) => {
        const requestElement = document.createElement("div");

        requestElement.innerHTML = `
        <p>${request.username}</p>
        <p>${request.user_id}</p>

        <button type="button" class="acceptFriend">
            Accept
        </button>

        <button type="button" class="rejectFriend">
            Reject
        </button>
    `;

        requestElement
            .querySelector(".acceptFriend")
            .addEventListener("click", () => {
                handleFriendRequest(request.id, "accept");
            });

        requestElement
            .querySelector(".rejectFriend")
            .addEventListener("click", () => {
                handleFriendRequest(request.id, "reject");
            });

        friendRequests.appendChild(requestElement);
    });
}
async function loadFriends() {
    const response = await fetch("/api/friendships");

    if (!response.ok) {
        return;
    }

    const data = await response.json();

    friendsList.innerHTML = "";

    data.friends.forEach((friend) => {
        const friendElement = document.createElement("div");

        friendElement.innerHTML = `
            <p>Username: ${friend.username}</p>
            <p>User ID: ${friend.id}</p>
        `;

        friendsList.appendChild(friendElement);
    });
}

async function handleFriendRequest(id, action) {
    const response = await fetch(
        `/api/friendships/${id}/${action}`,
        {
            method: "POST"
        }
    );

    const data = await response.json();

    if (!response.ok) {
        alert(data.message);
        return;
    }

    await loadFriendRequests();
    await loadFriends();
}

showRegister.addEventListener("click", () => {
    loginSection.hidden = true;
    registerSection.hidden = false;
    loginMessage.textContent = "";
});


showLogin.addEventListener("click", () => {
    registerSection.hidden = true;
    loginSection.hidden = false;
    registerMessage.textContent = "";
});


registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const usernameValue =
        document.getElementById("registerUsername").value;

    const email =
        document.getElementById("registerEmail").value;

    const password =
        document.getElementById("registerPassword").value;

    const confirmPassword =
        document.getElementById("confirmPassword").value;


    if (password !== confirmPassword) {
        registerMessage.textContent =
            "Passwords do not match";

        return;
    }


    const response = await fetch("/api/auth/register", {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            username: usernameValue,
            email,
            password
        })
    });


    const data = await response.json();


    if (!response.ok) {
        registerMessage.textContent = data.message;
        return;
    }


    registerMessage.textContent =
        "Account created successfully";

    registerForm.reset();

    setTimeout(() => {
        registerSection.hidden = true;
        loginSection.hidden = false;

        loginMessage.textContent =
            "Account created. You can now log in.";
    }, 1000);
});

findUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = userId.value.trim();

    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();

    if (!response.ok) {
        foundUser.hidden = true;
        findUserMessage.textContent = data.message;
        return;
    }

    findUserMessage.textContent = "";

    foundUsername.textContent = data.user.username;
    foundUserId.textContent = data.user.id;

    foundUser.hidden = false;
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email =
        document.getElementById("loginEmail").value;

    const password =
        document.getElementById("loginPassword").value;

    const response = await fetch("/api/auth/login", {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            email,
            password
        })
    });

    const data = await response.json();

    if (!response.ok) {
        loginMessage.textContent = data.message;
        return;
    }

    const meResponse =
        await fetch("/api/auth/me");

    const meData =
        await meResponse.json();

    loginSection.hidden = true;
    registerSection.hidden = true;
    userInfo.hidden = false;

    username.textContent =
        `Username: ${meData.user.username}`;

    userEmail.textContent =
        `Email: ${meData.user.email}`;

    currentUserId.textContent =
        meData.user.id;
});

copyUserId.addEventListener("click", async () => {
    await navigator.clipboard.writeText(
        currentUserId.textContent
    );

    copyMessage.textContent =
        "User ID copied";
});

const addFriend = document.getElementById("addFriend");
const friendMessage = document.getElementById("friendMessage");

addFriend.addEventListener("click", async () => {
    const targetUserId = foundUserId.textContent;

    const response = await fetch("/api/friendships/request", {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            targetUserId
        })
    });

    const data = await response.json();

    friendMessage.textContent = data.message;
});

const logout = document.getElementById("logout");
const logoutMessage = document.getElementById("logoutMessage");

logout.addEventListener("click", async () => {
    const response = await fetch("/api/auth/logout", {
        method: "POST"
    });

    const data = await response.json();

    if (!response.ok) {
        logoutMessage.textContent = data.message;
        return;
    }

    userInfo.hidden = true;
    loginSection.hidden = false;

    loginMessage.textContent =
        "You have been logged out.";
});
async function checkSession() {
    const response = await fetch("/api/auth/me");

    if (!response.ok) {
        return;
    }

    const data = await response.json();

    loginSection.hidden = true;
    registerSection.hidden = true;
    userInfo.hidden = false;

    username.textContent =
        `Username: ${data.user.username}`;

    userEmail.textContent =
        `Email: ${data.user.email}`;

    currentUserId.textContent =
        data.user.id;
    await loadFriendRequests();
    await loadFriends();
}
checkSession();