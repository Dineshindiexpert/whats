// --- USER DATA (You can load from API also) ---
const users = [
  {
    id: 1,
    name: "Rohit Sharma",
    lastMsg: "Typing...",
    img: "https://i.pravatar.cc/100?img=12"
  },
  {
    id: 2,
    name: "Ananya",
    lastMsg: "Hey, what's up?",
    img: "https://i.pravatar.cc/100?img=23"
  },
  {
    id: 3,
    name: "Amit Verma",
    lastMsg: "Call me ASAP!",
    img: "https://i.pravatar.cc/100?img=30"
  }
];


// ----------- LOAD USERS INTO HTML -----------
window.onload = () => {
  const userList = document.getElementById("userList");

  users.forEach(user => {
    const userItem = document.createElement("div");
    userItem.classList.add("userItem");

    userItem.innerHTML = `
      <img src="${user.img}" />
      <div>
        <div class="fw-semibold">${user.name}</div>
        <small class="text-muted">${user.lastMsg}</small>
      </div>
    `;

    // CLICK → OPEN CHAT PAGE
    userItem.onclick = () => {
      window.location.href = `chat.html?user=${user.id}`;
    };

    userList.appendChild(userItem);
  });
};

