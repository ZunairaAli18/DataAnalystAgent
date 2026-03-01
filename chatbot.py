import streamlit as st
import pandas as pd
from langchain_community.document_loaders import CSVLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaLLM, ChatOllama  # LOCAL LLM
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

st.title("📊 CSV Q&A Bot (Local Ollama)")

# File uploader
uploaded_file = st.file_uploader("Choose CSV file", type="csv")

if uploaded_file is not None:
    csv_path = "temp.csv"
    with open(csv_path, "wb") as f:
        f.write(uploaded_file.getvalue())
    
    if st.button("🔄 Process CSV", type="primary"):
        with st.spinner("Processing..."):
            # Load & process CSV
            loader = CSVLoader(file_path=csv_path)
            docs = loader.load()
            splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
            chunks = splitter.split_documents(docs)
            
            # Local embeddings
            embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
            vectorstore = FAISS.from_documents(chunks, embeddings)
            retriever = vectorstore.as_retriever(search_kwargs={"k": 4})
            
            # Store in session
            st.session_state.retriever = retriever
            st.session_state.ready = True
            
            st.success(f"✅ CSV processed! {len(docs)} rows ready.")
            
            # Preview
            df = pd.read_csv(csv_path)
            st.subheader("📋 Data Preview")
            st.dataframe(df.head(10))

    # Chat interface
    if hasattr(st.session_state, 'ready') and st.session_state.ready:
        st.subheader("💬 Ask about your CSV")
        
        # Try Ollama first, fallback to simple response
        try:
            llm = ChatOllama(model="llama3.2")  # Download once
            
            def format_docs(docs):
                return "\n\n".join(doc.page_content for doc in docs)

            prompt = ChatPromptTemplate.from_template("""
            Answer using ONLY the CSV data provided. 
            If not found, say "Not in CSV data".
            
            CSV Context:
            {context}
            
            Question: {question}
            Answer:""")

            chain = (
                {"context": st.session_state.retriever | format_docs, "question": RunnablePassthrough()}
                | prompt
                | llm
                | StrOutputParser()
            )

            # Chat UI
            if "messages" not in st.session_state:
                st.session_state.messages = []

            for message in st.session_state.messages:
                with st.chat_message(message["role"]):
                    st.markdown(message["content"])

            if query := st.chat_input("Ask about CSV data..."):
                st.session_state.messages.append({"role": "user", "content": query})
                with st.chat_message("user"):
                    st.markdown(query)

                with st.chat_message("assistant"):
                    with st.spinner("Answering..."):
                        response = chain.invoke(query)
                        st.markdown(response)
                        st.session_state.messages.append({"role": "assistant", "content": response})

        except Exception as e:
            st.error(f"Ollama not running: {str(e)}")
            st.info("💡 Install Ollama: https://ollama.com")

else:
    st.info("👆 Upload your CSV file")
