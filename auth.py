"""
Autenticación con Google OAuth para Streamlit
"""
import os
import streamlit as st
import requests
import json
import hashlib
import time

# Configuración OAuth
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "https://davivienda-elearning-1087920188542.us-central1.run.app")

# Dominios permitidos para Learning
DOMINIOS_LEARNING = ["davivienda.com", "alkemy.org"]  # alkemy.org para testing


def get_google_auth_url():
    """Genera URL para iniciar OAuth con Google"""
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account"
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{base_url}?{query}"


def exchange_code_for_token(code):
    """Intercambia el código por tokens"""
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI
    }
    try:
        response = requests.post(token_url, data=data, timeout=10)
        if response.status_code == 200:
            return response.json(), None
        else:
            return None, f"Token error: {response.status_code} - {response.text}"
    except Exception as e:
        return None, str(e)


def get_user_info(access_token):
    """Obtiene información del usuario"""
    userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        response = requests.get(userinfo_url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json(), None
        else:
            return None, f"Userinfo error: {response.status_code}"
    except Exception as e:
        return None, str(e)


def check_domain_allowed(email):
    """Verifica si el dominio del email está permitido"""
    if not email:
        return False
    domain = email.split("@")[-1].lower()
    return domain in DOMINIOS_LEARNING


def init_auth_state():
    """Inicializa el estado de autenticación"""
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    if "user_email" not in st.session_state:
        st.session_state.user_email = None
    if "user_name" not in st.session_state:
        st.session_state.user_name = None
    if "rol" not in st.session_state:
        st.session_state.rol = None
    if "auth_error" not in st.session_state:
        st.session_state.auth_error = None


def handle_oauth_callback():
    """Maneja el callback de OAuth"""
    query_params = st.query_params

    # Si ya está autenticado, no hacer nada
    if st.session_state.get("authenticated"):
        return True

    if "code" in query_params:
        code = query_params["code"]

        # Intercambiar código por token
        tokens, error = exchange_code_for_token(code)

        if error:
            st.session_state.auth_error = f"Error de autenticación: {error}"
            st.query_params.clear()
            return False

        if tokens and "access_token" in tokens:
            # Obtener info del usuario
            user_info, error = get_user_info(tokens["access_token"])

            if error:
                st.session_state.auth_error = f"Error obteniendo usuario: {error}"
                st.query_params.clear()
                return False

            if user_info:
                email = user_info.get("email", "")

                if check_domain_allowed(email):
                    # ¡Autenticación exitosa!
                    st.session_state.authenticated = True
                    st.session_state.user_email = email
                    st.session_state.user_name = user_info.get("name", email)
                    st.session_state.rol = "learning"
                    st.session_state.auth_error = None

                    # Limpiar query params y recargar
                    st.query_params.clear()
                    return True
                else:
                    st.session_state.auth_error = f"El email {email} no tiene acceso. Solo dominios: {', '.join(DOMINIOS_LEARNING)}"
                    st.query_params.clear()
                    return False

        st.query_params.clear()

    return False


def show_login_page():
    """Muestra la página de selección de rol / login"""

    # Logo Davivienda en base64
    LOGO_DAVIVIENDA = "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"

    # Mostrar errores si hay
    if st.session_state.get("auth_error"):
        st.error(st.session_state.auth_error)
        st.session_state.auth_error = None

    # CSS con loader animado
    st.markdown(f"""
    <style>
    .login-header {{
        text-align: center;
        padding: 40px 20px 20px 20px;
    }}
    .login-logo {{
        height: 80px;
        margin-bottom: 20px;
    }}
    .login-title {{
        font-size: 28px;
        font-weight: 700;
        color: #DA291C;
        margin-bottom: 8px;
    }}
    .login-subtitle {{
        font-size: 16px;
        color: #666;
        margin-bottom: 30px;
    }}
    .role-card {{
        background: white;
        border-radius: 16px;
        padding: 30px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        border: 2px solid #f0f0f0;
        transition: all 0.3s ease;
        height: 100%;
    }}
    .role-card:hover {{
        border-color: #DA291C;
        box-shadow: 0 8px 30px rgba(218,41,28,0.15);
    }}
    .role-icon {{
        font-size: 48px;
        margin-bottom: 15px;
    }}
    .role-title {{
        font-size: 20px;
        font-weight: 600;
        color: #333;
        margin-bottom: 10px;
    }}
    .role-desc {{
        font-size: 14px;
        color: #666;
        margin-bottom: 20px;
    }}
    .divider {{
        display: flex;
        align-items: center;
        margin: 30px 0;
    }}
    .divider::before, .divider::after {{
        content: "";
        flex: 1;
        border-bottom: 1px solid #e0e0e0;
    }}
    .divider-text {{
        padding: 0 20px;
        color: #999;
        font-size: 14px;
    }}
    </style>

    <div class="login-header">
        <img src="data:image/png;base64,{LOGO_DAVIVIENDA}" class="login-logo" alt="Davivienda">
        <div class="login-title">E-Learning Studio</div>
        <div class="login-subtitle">Plataforma de creación de cursos con IA</div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("### Seleccioná tu perfil para continuar")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("""
        <div class="role-card">
            <div class="role-icon">📝</div>
            <div class="role-title">Área Solicitante</div>
            <div class="role-desc">Solicitá nuevos cursos e-learning para tu área de negocio</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Ingresar como Solicitante", type="primary", use_container_width=True, key="btn_solicitante"):
            st.session_state.rol = "solicitante"
            st.session_state.authenticated = True
            st.rerun()

    with col2:
        st.markdown("""
        <div class="role-card">
            <div class="role-icon">🎨</div>
            <div class="role-title">Learning</div>
            <div class="role-desc">Diseñá y producí cursos e-learning profesionales</div>
        </div>
        """, unsafe_allow_html=True)

        if GOOGLE_CLIENT_ID:
            auth_url = get_google_auth_url()
            # Usar JavaScript para navegar en la misma pestaña (evita popup)
            st.markdown(f"""
            <a href="{auth_url}" target="_self" onclick="window.location.href='{auth_url}'; return false;" style="
                display: block;
                background: #DA291C;
                color: white;
                text-align: center;
                padding: 12px 20px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                font-size: 14px;
                margin-top: 10px;
                cursor: pointer;
            ">🔐 Ingresar con Google</a>
            """, unsafe_allow_html=True)
            st.caption("Solo emails autorizados (@davivienda.com)")
        else:
            st.warning("⚠️ Google OAuth no configurado")
            if st.button("Ingresar (dev)", key="btn_dev"):
                st.session_state.rol = "learning"
                st.session_state.authenticated = True
                st.session_state.user_email = "dev@local"
                st.rerun()


def logout():
    """Cierra sesión"""
    st.session_state.authenticated = False
    st.session_state.user_email = None
    st.session_state.user_name = None
    st.session_state.rol = None
    st.session_state.auth_error = None


def require_auth(allowed_roles=None):
    """Función para requerir autenticación"""
    init_auth_state()
    handle_oauth_callback()

    if not st.session_state.get("authenticated"):
        show_login_page()
        st.stop()

    if allowed_roles and st.session_state.get("rol") not in allowed_roles:
        st.error("No tenés acceso a esta sección")
        st.stop()

    return True
